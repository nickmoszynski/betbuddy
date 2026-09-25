// Shared server-side logic for the scheduled job and the SMS endpoint.
// Runs on Netlify with the Supabase service-role key (never shipped to browsers).
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const env = (k, d) => process.env[k] ?? d;

export const db = () =>
  createClient(env("SUPABASE_URL") || env("VITE_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const SPORTS = {
  nfl:   { key: "americanfootball_nfl",   label: "NFL"   },
  ncaaf: { key: "americanfootball_ncaaf", label: "NCAAF" },
  nba:   { key: "basketball_nba",         label: "NBA"   },
  ncaab: { key: "basketball_ncaab",       label: "NCAAB" },
  mlb:   { key: "baseball_mlb",           label: "MLB"   },
  nhl:   { key: "icehockey_nhl",          label: "NHL"   },
};
const enabledSports = () =>
  env("SPORTS", "nfl,ncaaf,nba,ncaab,mlb,nhl").split(",").map((s) => s.trim().toLowerCase()).filter((s) => SPORTS[s]);

const BOOK_PREF = ["draftkings", "fanduel", "betmgm", "caesars", "espnbet", "betrivers", "bovada"];
const ODDS = "https://api.the-odds-api.com/v4";
const isoNoMs = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

async function oddsGet(path, params = {}) {
  const qs = new URLSearchParams({ apiKey: env("ODDS_API_KEY"), ...params });
  const res = await fetch(`${ODDS}${path}?${qs}`);
  if (!res.ok) throw new Error(`Odds API ${path} → ${res.status} ${await res.text()}`);
  return { data: await res.json(), remaining: res.headers.get("x-requests-remaining") };
}

// ── Throttling state (stored in the sync_state table) ─────────────────
async function due(sb, key, minutes) {
  const { data } = await sb.from("sync_state").select("value").eq("key", key).maybeSingle();
  return !data || Date.now() - new Date(data.value).getTime() >= minutes * 60_000;
}
const mark = (sb, key) => sb.from("sync_state").upsert({ key, value: new Date().toISOString() });

// ── Lines: pull point spreads for the next 8 days ─────────────────────
export function pickSpread(event) {
  const books = [...(event.bookmakers || [])].sort(
    (a, b) => (BOOK_PREF.indexOf(a.key) + 1 || 99) - (BOOK_PREF.indexOf(b.key) + 1 || 99)
  );
  for (const b of books) {
    const m = b.markets?.find((x) => x.key === "spreads");
    if (!m || m.outcomes?.length !== 2) continue;
    const [o1, o2] = m.outcomes;
    if (o1.point == null || o2.point == null) continue;
    if (o1.point === 0 && o2.point === 0) return { fav_team: event.home_team, spread: 0 };
    const fav = o1.point < 0 ? o1 : o2.point < 0 ? o2 : null;
    if (!fav) continue;
    return { fav_team: fav.name, spread: fav.point };
  }
  return null;
}

export async function syncOdds(sb, log) {
  const { data: active } = await oddsGet("/sports"); // free call
  const activeKeys = new Set(active.filter((s) => s.active).map((s) => s.key));
  const now = new Date();
  for (const code of enabledSports()) {
    const sport = SPORTS[code];
    if (!activeKeys.has(sport.key)) continue;
    const { data: events, remaining } = await oddsGet(`/sports/${sport.key}/odds`, {
      regions: "us", markets: "spreads", oddsFormat: "american", dateFormat: "iso",
      commenceTimeTo: isoNoMs(new Date(now.getTime() + 8 * 86400_000)),
    });
    const upcoming = events.filter((e) => new Date(e.commence_time) > now);
    if (!upcoming.length) continue;

    // Never touch games that already started
    const { data: existing } = await sb.from("games").select("id,status").in("id", upcoming.map((e) => e.id));
    const started = new Set((existing || []).filter((g) => g.status !== "upcoming").map((g) => g.id));

    const rows = upcoming.filter((e) => !started.has(e.id)).map((e) => {
      const line = pickSpread(e);
      return {
        id: e.id, sport: sport.label, sport_key: sport.key, home: e.home_team, away: e.away_team,
        commence_time: e.commence_time, fav_team: line?.fav_team ?? null, spread: line?.spread ?? null,
        updated_at: now.toISOString(),
      };
    });
    const { error } = await sb.from("games").upsert(rows);
    if (error) throw error;
    log(`${sport.label}: ${rows.length} games (${remaining} API credits left)`);
  }
}

// ── Scores: only for sports where money is riding on a started game ───
export async function syncScores(sb, log) {
  const since = new Date(Date.now() - 2.5 * 86400_000).toISOString(); // Odds API scores reach back 3 days max
  const { data: open } = await sb.from("games").select("id,sport_key,home,away,status")
    .eq("settled", false).lte("commence_time", new Date().toISOString()).gte("commence_time", since);
  // Games that finished with no bets on them: mark settled so they drop out
  const { data: stale } = await sb.from("games").select("id").eq("settled", false)
    .lt("commence_time", new Date(Date.now() - 8 * 3600_000).toISOString());
  if (stale?.length) {
    const { data: live } = await sb.from("wagers").select("game_id").eq("status", "locked").in("game_id", stale.map((g) => g.id));
    const keep = new Set((live || []).map((w) => w.game_id)); // money riding → leave for scores / admin
    const done = stale.map((g) => g.id).filter((id) => !keep.has(id));
    if (done.length) await sb.from("games").update({ settled: true, status: "final" }).in("id", done);
  }

  if (!open?.length) return;

  const { data: bets } = await sb.from("wagers").select("game_id").eq("status", "locked").in("game_id", open.map((g) => g.id));
  const withBets = new Set((bets || []).map((b) => b.game_id));
  const sportKeys = [...new Set(open.filter((g) => withBets.has(g.id)).map((g) => g.sport_key))];
  const byId = new Map(open.map((g) => [g.id, g]));

  for (const key of sportKeys) {
    const { data: events, remaining } = await oddsGet(`/sports/${key}/scores`, { daysFrom: "3", dateFormat: "iso" });
    for (const e of events) {
      const g = byId.get(e.id);
      if (!g || !e.scores) continue;
      const score = (team) => Number(e.scores.find((s) => s.name === team)?.score);
      const home = score(g.home), away = score(g.away);
      if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
      await sb.from("games").update({
        home_score: home, away_score: away, status: e.completed ? "final" : "live", updated_at: new Date().toISOString(),
      }).eq("id", g.id).eq("settled", false);
      if (e.completed) {
        const { data: n, error } = await sb.rpc("settle_game", { p_game_id: g.id });
        if (error) log(`settle ${g.id} failed: ${error.message}`);
        else log(`Settled ${g.away} @ ${g.home} ${away}-${home} (${n} bets)`);
      }
    }
    log(`scores ${key} (${remaining} API credits left)`);
  }

}

// ── Push notifications ────────────────────────────────────────────────
// Signing keys are created automatically the first time and stored in app_config.
export async function vapidKeys(sb) {
  const read = async () => {
    const { data } = await sb.from("app_config").select("key,value").in("key", ["vapid_public", "vapid_private"]);
    return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  };
  let k = await read();
  if (!k.vapid_public || !k.vapid_private) {
    const gen = webpush.generateVAPIDKeys();
    await sb.from("app_config").upsert(
      [{ key: "vapid_public", value: gen.publicKey }, { key: "vapid_private", value: gen.privateKey }],
      { onConflict: "key", ignoreDuplicates: true }
    );
    k = await read();
  }
  return k;
}

export async function flushPush(sb, log = () => {}) {
  const { data: items, error } = await sb.rpc("claim_push", { p_limit: 50 });
  if (error) throw error;
  if (!items?.length) return 0;
  const keys = await vapidKeys(sb);
  webpush.setVapidDetails(env("VAPID_SUBJECT") || env("URL") || "mailto:bank@betbuddy.app", keys.vapid_public, keys.vapid_private);
  const { data: subs } = await sb.from("push_subscriptions").select("*").in("user_id", [...new Set(items.map((i) => i.user_id))]);
  const dead = new Set();
  const jobs = [];
  for (const it of items) {
    for (const s of (subs || []).filter((x) => x.user_id === it.user_id)) {
      const payload = JSON.stringify({ title: it.title, body: it.body || "", url: it.url || "/", tag: `bb-${it.id}` });
      jobs.push(
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" })
          .catch((e) => { if (e.statusCode === 404 || e.statusCode === 410) dead.add(s.endpoint); else log(`push failed (${e.statusCode || ""}): ${e.body || e.message}`); })
      );
    }
  }
  await Promise.all(jobs);
  if (dead.size) await sb.from("push_subscriptions").delete().in("endpoint", [...dead]);
  return jobs.length;
}

// ── Texts ─────────────────────────────────────────────────────────────
export async function flushSms(sb, log = () => {}) {
  const { data: msgs, error } = await sb.rpc("claim_sms", { p_limit: 20 });
  if (error) throw error;
  if (!msgs?.length) return 0;
  msgs.sort((x, y) => x.id - y.id);
  const sid = env("TWILIO_ACCOUNT_SID"), token = env("TWILIO_AUTH_TOKEN"), from = env("TWILIO_FROM");
  const link = env("APP_URL") || env("URL") || "";
  for (const m of msgs) {
    if (!sid || !token || !from) {
      await sb.from("sms_outbox").update({ error: "twilio not configured" }).eq("id", m.id);
      continue;
    }
    const body = new URLSearchParams({ To: `+${m.to_phone}`, Body: m.body.replaceAll("{link}", link) });
    body.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
      body,
    });
    if (!res.ok) {
      const err = (await res.text()).slice(0, 300);
      await sb.from("sms_outbox").update({ error: err }).eq("id", m.id);
      log(`SMS to ${m.to_phone} failed: ${err}`);
    }
  }
  return msgs.length;
}

// ── One tick of the background job ────────────────────────────────────
export async function tick(log = console.log) {
  const sb = db();
  const step = async (name, fn) => { try { await fn(); } catch (e) { log(`${name} error: ${e.message}`); } };

  await step("push", () => flushPush(sb, log));
  await step("sms", () => flushSms(sb, log));
  await step("live", async () => {
    await sb.from("games").update({ status: "live" }).eq("status", "upcoming").lte("commence_time", new Date().toISOString());
    await sb.rpc("expire_started");
  });
  if (env("ODDS_API_KEY")) {
    await step("odds", async () => {
      if (await due(sb, "odds", Number(env("ODDS_REFRESH_MINUTES", 240)))) { await mark(sb, "odds"); await syncOdds(sb, log); }
    });
    await step("scores", async () => {
      if (await due(sb, "scores", Number(env("SCORES_REFRESH_MINUTES", 10)))) { await mark(sb, "scores"); await syncScores(sb, log); }
    });
  }
  await step("push", () => flushPush(sb, log));
  await step("sms", () => flushSms(sb, log));
}

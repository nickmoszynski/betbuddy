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
  env("SPORTS", "nfl,ncaaf,nba,ncaab").split(",").map((s) => s.trim().toLowerCase()).filter((s) => SPORTS[s]);

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
  const ranked = await rankedSets(sb);
  for (const code of enabledSports()) {
    const sport = SPORTS[code];
    if (!activeKeys.has(sport.key)) continue;
    const { data: events, remaining } = await oddsGet(`/sports/${sport.key}/odds`, {
      regions: "us", markets: "spreads", oddsFormat: "american", dateFormat: "iso",
      commenceTimeTo: isoNoMs(new Date(now.getTime() + 8 * 86400_000)),
    });
    let upcoming = events.filter((e) => new Date(e.commence_time) > now);
    // College: only games with an AP Top 25 team (once rankings have loaded)
    const set = ranked[sport.label];
    if (set && set.size) upcoming = upcoming.filter((e) => set.has(norm(e.home_team)) || set.has(norm(e.away_team)));
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
  const sportKeys = [...new Set(open.filter((g) => withBets.has(g.id)).map((g) => g.sport_key))].filter((k) => !k.startsWith("kalshi:"));
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

// ── Team names, logos & AP rankings (ESPN, refreshed a couple of times a day) ──
export const norm = (t = "") => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const LEAGUES = {
  NFL:   { path: "football/nfl" },
  NBA:   { path: "basketball/nba" },
  NCAAF: { path: "football/college-football", college: true, groups: 80 },
  NCAAB: { path: "basketball/mens-college-basketball", college: true, groups: 50 },
};
const leagueOf = (label) => LEAGUES[label]?.path.split("/")[1];
async function getJSON(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; BetBuddy/1.0)", accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// What the admin "sync report" shows: when each background job last ran + what's loaded
export async function syncStatus(sb) {
  const { data: runs } = await sb.from("sync_state").select("key,value");
  const count = async (q) => (await q).count ?? null;
  const teams = {};
  for (const label of Object.keys(LEAGUES)) {
    teams[label] = {
      teams: await count(sb.from("teams").select("name_key", { count: "exact", head: true }).eq("league", leagueOf(label))),
      ranked: new Set(((await sb.from("teams").select("rank").eq("league", leagueOf(label)).not("rank", "is", null)).data || []).map((r) => r.rank)).size,
    };
  }
  const upcoming = await count(sb.from("games").select("id", { count: "exact", head: true }).gt("commence_time", new Date().toISOString()));
  const matchups = await count(sb.from("games").select("id", { count: "exact", head: true }).eq("kind", "h2h").gt("commence_time", new Date().toISOString()));
  return { runs: Object.fromEntries((runs || []).map((r) => [r.key, r.value])), teams, upcoming, matchups, oddsKey: !!env("ODDS_API_KEY") };
}

// ESPN blocks some cloud servers (Netlify gets 403), so the teams table is also
// seeded by migration 005. A failed fetch here just keeps the saved rows.
const ESPN_HOSTS = ["https://site.api.espn.com", "https://site.web.api.espn.com"];
async function espn(path) {
  let last;
  for (const h of ESPN_HOSTS) {
    try { return await getJSON(`${h}/apis/site/v2/sports/${path}`); } catch (e) { last = e; }
  }
  throw last;
}

export async function syncTeams(sb, log = () => {}) {
  const now = new Date().toISOString();
  for (const [label, L] of Object.entries(LEAGUES)) {
    const league = leagueOf(label);
    try {
      const j = await espn(`${L.path}/teams?limit=1000${L.groups ? `&groups=${L.groups}` : ""}`);
      const teams = (j.sports?.[0]?.leagues?.[0]?.teams || []).map((x) => x.team).filter(Boolean);
      const rows = teams.map((t) => ({
        league, name_key: norm(t.displayName), full_name: t.displayName,
        short_name: L.college ? (t.location || t.displayName) : (t.name || t.shortDisplayName || t.displayName),
        abbr: t.abbreviation || null, color: t.color ? `#${t.color}` : null, alt_color: t.alternateColor ? `#${t.alternateColor}` : null,
        logo: (t.logos || []).find((l) => (l.rel || []).includes("dark"))?.href || t.logos?.[0]?.href || null, updated_at: now,
      }));
      const uniq = [...new Map(rows.map((r) => [r.name_key, r])).values()];
      for (let i = 0; i < uniq.length; i += 500) {
        const { error } = await sb.from("teams").upsert(uniq.slice(i, i + 500), { onConflict: "league,name_key" });
        if (error) throw error;
      }
      log(`${label}: ${uniq.length} teams from ESPN`);
    } catch (e) {
      const { count } = await sb.from("teams").select("name_key", { count: "exact", head: true }).eq("league", league);
      log(`${label}: ESPN unavailable (${String(e.message).replace(/^.*→ /, "")}), using ${count ?? 0} saved teams`);
    }
  }
  await syncRankings(sb, log);
}

// ── AP Top 25: ESPN first, then the NCAA's own poll page (ncaa-api mirror) ──
const NCAA_POLL = {
  NCAAF: "https://ncaa-api.henrygd.me/rankings/football/fbs/associated-press",
  NCAAB: "https://ncaa-api.henrygd.me/rankings/basketball-men/d1/associated-press",
};
// NCAA poll spellings → ESPN school names
const RANK_ALIAS = {
  miamifl: "Miami", miamiflorida: "Miami", southerncal: "USC", southerncalifornia: "USC", mississippi: "Ole Miss",
  centralflorida: "UCF", brighamyoung: "BYU", louisianastate: "LSU", texaschristian: "TCU", southernmethodist: "SMU",
  northcarolinastate: "NC State", ncstate: "NC State", pitt: "Pittsburgh", appalachianstate: "App State",
  connecticut: "UConn", massachusetts: "Massachusetts", umass: "Massachusetts", saintmarysca: "Saint Mary's",
  stmarysca: "Saint Mary's", stjohnsny: "St. John's", hawaii: "Hawai'i", sanjosestate: "San José State",
  southernmississippi: "Southern Miss", louisianamonroe: "UL Monroe", fiu: "Florida International", fau: "Florida Atlantic",
  floridainternational: "Florida International", floridaatlantic: "Florida Atlantic", virginiacommonwealth: "VCU",
  nevadalasvegas: "UNLV", texaselpaso: "UTEP", texassanantonio: "UTSA", alabamabirmingham: "UAB",
  loyolail: "Loyola Chicago", loyolachicago: "Loyola Chicago", miamioh: "Miami (OH)",
};
export const cleanSchool = (s = "") => s.replace(/\s*\(\d+\)\s*$/, "").replace(/\bSt\.$/, "State").replace(/\bSt\.(?=\s*\()/, "State").trim();

async function fetchRanks(label, L) {
  const out = [];
  try {
    const rk = await espn(`${L.path}/rankings`);
    const ap = rk?.rankings?.find((x) => /^AP/i.test(x.name || "")) || rk?.rankings?.[0];
    for (const k of ap?.ranks || []) if (k.team && k.current) out.push([k.team.location, k.current]);
    if (out.length) return { src: "ESPN", out };
  } catch {}
  out.length = 0;
  const j = await getJSON(NCAA_POLL[label]);
  const key = (row) => Object.keys(row).find((k) => /^SCHOOL/i.test(k));
  for (const row of j.data || []) {
    const r = parseInt(row.RANK, 10);
    if (r > 0) out.push([cleanSchool(row[key(row)]), r]);
  }
  return { src: "NCAA", out };
}

export async function syncRankings(sb, log = () => {}) {
  for (const [label, L] of Object.entries(LEAGUES)) {
    if (!L.college) continue;
    const league = leagueOf(label);
    try {
      const { src, out } = await fetchRanks(label, L);
      const { data: teams } = await sb.from("teams").select("name_key,short_name").eq("league", league);
      const bySchool = new Map();
      for (const t of teams || []) {
        const k = norm(t.short_name);
        bySchool.set(k, [...(bySchool.get(k) || []), t.name_key]);
      }
      const hits = [], missed = [];
      for (const [school, rank] of out) {
        const n = norm(school);
        const keys = bySchool.get(n) || bySchool.get(norm(RANK_ALIAS[n] || "")) || bySchool.get(norm(school.replace(/State$/, "St.")));
        if (keys) hits.push([keys, rank]); else missed.push(school);
      }
      if (hits.length < Math.min(20, out.length) || !hits.length) {
        log(`${label} rankings: only matched ${hits.length}/${out.length} (${missed.join(", ")}); kept previous`);
        continue;
      }
      await sb.from("teams").update({ rank: null }).eq("league", league).not("rank", "is", null);
      for (const [keys, rank] of hits) await sb.from("teams").update({ rank }).eq("league", league).in("name_key", keys);
      log(`${label}: AP Top 25 from ${src}, ${hits.length} ranked${missed.length ? ` (unmatched: ${missed.join(", ")})` : ""}`);
    } catch (e) { log(`${label} rankings failed: ${e.message}`); }
  }
}

// { NCAAF: Set(name_key of ranked teams), NCAAB: ... } — empty until rankings load
async function rankedSets(sb) {
  const out = {};
  for (const label of ["NCAAF", "NCAAB"]) {
    const { data } = await sb.from("teams").select("name_key").eq("league", leagueOf(label)).not("rank", "is", null);
    out[label] = new Set((data || []).map((r) => r.name_key));
  }
  return out;
}

// ── Head-to-head matchups from Kalshi (golf rounds, F1 when listed) ─────
// Source of truth for both the price (only near-even matchups are listed) and the result.
const KALSHI = () => env("KALSHI_API", "https://external-api.kalshi.com/trade-api/v2");
const h2hSeries = () => Object.fromEntries(
  env("H2H_SERIES", "KXPGAH2H:GOLF,KXLIVH2H:GOLF,KXDPWTH2H:GOLF,KXGOLFH2H:GOLF,KXF1H2H:F1").split(",").map((x) => x.trim().split(":")).filter((x) => x[0] && x[1])
);
const kPrice = (m) => {
  const b = Number(m.yes_bid_dollars), a = Number(m.yes_ask_dollars), l = Number(m.last_price_dollars);
  if (b > 0 && a > 0 && a < 1 && a >= b) return (a + b) / 2;
  return l > 0 && l < 1 ? l : null;
};
const MATCH_RE = /^Will (.+?) (?:beat|finish (?:ahead of|higher than|above)|outscore|outperform|outlast) (.+?) (?:in|at|during) (?:the )?(.+?)\??$/i;
export function parseH2HMarket(m) {
  const x = MATCH_RE.exec((m.title || "").trim());
  if (!x) return null;
  return { player: x[1].trim(), opponent: x[2].trim(), context: x[3].trim() };
}
export function h2hTitle(context = "") {
  const c = context.replace(/\?$/, "");
  const m = /^(\d)(?:st|nd|rd|th) round of (?:the )?(.+)$/i.exec(c);
  if (m) return `Round ${m[1]} · ${m[2]}`;
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export async function syncH2H(sb, log = () => {}) {
  const now = Date.now();
  const maxEdge = Number(env("H2H_MAX_EDGE", 0.1)); // 0.1 → only matchups priced 40%–60%
  for (const [series, sport] of Object.entries(h2hSeries())) {
    try {
      let cursor = "", pages = 0, kept = 0, seen = 0;
      const rows = [];
      do {
        const j = await getJSON(`${KALSHI()}/events?series_ticker=${series}&status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${cursor}` : ""}`);
        cursor = j.cursor || "";
        for (const ev of j.events || []) {
          const ms = ev.markets || [];
          if (ms.length !== 2) continue;
          seen++;
          const [p0, p1] = ms.map(parseH2HMarket);
          if (!p0 || !p1 || norm(p0.player) !== norm(p1.opponent)) continue;
          const pa = kPrice(ms[0]), pb = kPrice(ms[1]);
          if (pa == null || pb == null) continue;
          const pA = pa / (pa + pb);
          if (Math.abs(pA - 0.5) > maxEdge) continue;
          const lock = ms[0].occurrence_datetime || ms[0].expected_expiration_time;
          const t = lock ? new Date(lock).getTime() : NaN;
          if (!Number.isFinite(t) || t <= now + 5 * 60_000 || t > now + 8 * 86400_000) continue;
          rows.push({
            id: ev.event_ticker, sport, sport_key: `kalshi:${series}`, kind: "h2h",
            away: p0.player, home: p1.player, fav_team: p0.player, spread: 0,
            commence_time: new Date(t).toISOString(), title: h2hTitle(p0.context),
            ext: { source: "kalshi", a: { ticker: ms[0].ticker, p: Math.round(pA * 100) / 100 }, b: { ticker: ms[1].ticker, p: Math.round((1 - pA) * 100) / 100 } },
            updated_at: new Date().toISOString(),
          });
          kept++;
        }
      } while (cursor && ++pages < 5);
      if (rows.length) {
        const { data: existing } = await sb.from("games").select("id,status").in("id", rows.map((r) => r.id));
        const started = new Set((existing || []).filter((g) => g.status !== "upcoming").map((g) => g.id));
        const fresh = rows.filter((r) => !started.has(r.id));
        if (fresh.length) { const { error } = await sb.from("games").upsert(fresh); if (error) throw error; }
      }
      log(`${series}: ${kept} even matchups of ${seen}`);
    } catch (e) { log(`h2h ${series} failed: ${e.message}`); }
  }
}

export async function settleH2H(sb, log = () => {}) {
  const { data: games } = await sb.from("games").select("id,away,home,ext").eq("kind", "h2h").eq("settled", false)
    .lte("commence_time", new Date().toISOString()).limit(60);
  for (const g of games || []) {
    try {
      const j = await getJSON(`${KALSHI()}/markets?event_ticker=${encodeURIComponent(g.id)}`);
      const ms = j.markets || [];
      const a = ms.find((m) => m.ticker === g.ext?.a?.ticker), b = ms.find((m) => m.ticker === g.ext?.b?.ticker);
      if (!a || !b) continue;
      const done = (m) => ["finalized", "settled", "determined"].includes(m.status) && m.result && m.result !== "";
      if (!done(a) || !done(b)) continue;
      const away = a.result === "yes" && b.result !== "yes" ? 1 : 0;   // player A won
      const home = b.result === "yes" && a.result !== "yes" ? 1 : 0;   // player B won; anything else = push
      await sb.from("games").update({ status: "final", away_score: away, home_score: home, updated_at: new Date().toISOString() }).eq("id", g.id).eq("settled", false);
      const { data: n, error } = await sb.rpc("settle_game", { p_game_id: g.id });
      if (error) log(`settle ${g.id} failed: ${error.message}`);
      else log(`Settled ${g.away} vs ${g.home}: ${away ? g.away : home ? g.home : "tie"} (${n} bets)`);
    } catch (e) { log(`settle ${g.id}: ${e.message}`); }
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
  await step("heartbeat", () => mark(sb, "tick"));

  await step("push", () => flushPush(sb, log));
  await step("sms", () => flushSms(sb, log));
  await step("live", async () => {
    await sb.from("games").update({ status: "live" }).eq("status", "upcoming").lte("commence_time", new Date().toISOString());
    await sb.rpc("expire_started");
  });
  await step("teams", async () => {
    if (await due(sb, "teams", Number(env("TEAMS_REFRESH_MINUTES", 720)))) { await mark(sb, "teams"); await syncTeams(sb, log); }
  });
  await step("h2h", async () => {
    if (await due(sb, "h2h", Number(env("H2H_REFRESH_MINUTES", 30)))) { await mark(sb, "h2h"); await syncH2H(sb, log); }
  });
  await step("h2h-settle", async () => {
    if (await due(sb, "h2h_settle", Number(env("SCORES_REFRESH_MINUTES", 10)))) { await mark(sb, "h2h_settle"); await settleH2H(sb, log); }
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

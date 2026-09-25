// Exercises the Netlify job code (odds sync, scores, settlement, texts) against
// the local shim with a fake Odds API + fake Twilio. Usage: node test/e2e_server.mjs [seed|settle]
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = `${b64({ alg: "HS256" })}.${b64({ role: "service_role", exp: 4102444800 })}.sig`;
process.env.ODDS_API_KEY = "test";
process.env.TWILIO_ACCOUNT_SID = "ACtest"; process.env.TWILIO_AUTH_TOKEN = "t"; process.env.TWILIO_FROM = "+14135559999";
process.env.URL = "https://betbuddy.example";

const day = (d, h, m = 0) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, m, 0, 0); return t.toISOString().replace(/\.\d+Z/, "Z"); };
const ev = (id, sport_key, away, home, when, fav, pt) => ({
  id, sport_key, commence_time: when, home_team: home, away_team: away,
  bookmakers: [{ key: "fanduel", markets: [{ key: "spreads", outcomes: [{ name: fav, point: pt }, { name: fav === home ? away : home, point: -pt }] }] },
               { key: "draftkings", markets: [{ key: "spreads", outcomes: [{ name: fav, point: pt }, { name: fav === home ? away : home, point: -pt }] }] }],
});
const FIXTURES = {
  americanfootball_nfl: [
    ev("nfl1", "americanfootball_nfl", "Miami Dolphins", "Buffalo Bills", day(3, 13), "Buffalo Bills", -6.5),
    ev("nfl2", "americanfootball_nfl", "New York Jets", "New England Patriots", day(3, 13), "New England Patriots", -3),
    ev("nfl3", "americanfootball_nfl", "Dallas Cowboys", "Philadelphia Eagles", day(3, 20, 20), "Philadelphia Eagles", -4.5),
    ev("nfl4", "americanfootball_nfl", "Kansas City Chiefs", "Baltimore Ravens", day(4, 20, 15), "Kansas City Chiefs", -1.5),
    ev("nfl5", "americanfootball_nfl", "Green Bay Packers", "Detroit Lions", day(0, 20, 15), "Detroit Lions", -2.5),
  ],
  americanfootball_ncaaf: [
    ev("cf1", "americanfootball_ncaaf", "Michigan Wolverines", "Ohio State Buckeyes", day(2, 12), "Ohio State Buckeyes", -9.5),
    ev("cf2", "americanfootball_ncaaf", "UMass Minutemen", "Boston College Eagles", day(2, 15, 30), "Boston College Eagles", -13),
  ],
  baseball_mlb: [
    ev("mlb1", "baseball_mlb", "New York Yankees", "Boston Red Sox", day(1, 19, 10), "New York Yankees", -1.5),
    { id: "mlb2", sport_key: "baseball_mlb", commence_time: day(1, 18, 40), home_team: "Tampa Bay Rays", away_team: "Toronto Blue Jays", bookmakers: [] },
  ],
};
const scores = [];
// ── ESPN + Kalshi fixtures (shapes captured from the live APIs) ──
const T = (displayName, location, name, abbreviation, color, logo) => ({ team: { displayName, location, name, abbreviation, color, alternateColor: "ffffff", logos: [{ href: logo }] } });
const NFL_T = [["Buffalo Bills","Buffalo","Bills","BUF","00338d","buf"],["Miami Dolphins","Miami","Dolphins","MIA","008e97","mia"],["New England Patriots","New England","Patriots","NE","002244","ne"],["New York Jets","New York","Jets","NYJ","125740","nyj"],["Dallas Cowboys","Dallas","Cowboys","DAL","003594","dal"],["Philadelphia Eagles","Philadelphia","Eagles","PHI","004c54","phi"],["Kansas City Chiefs","Kansas City","Chiefs","KC","e31837","kc"],["Baltimore Ravens","Baltimore","Ravens","BAL","241773","bal"],["Green Bay Packers","Green Bay","Packers","GB","203731","gb"],["Detroit Lions","Detroit","Lions","DET","0076b6","det"]]
  .map(([d,l,n,a,c,k]) => T(d,l,n,a,c,`https://a.espncdn.com/i/teamlogos/nfl/500/${k}.png`));
const CF_T = [T("Ohio State Buckeyes","Ohio State","Buckeyes","OSU","ba0c2f","https://a.espncdn.com/i/teamlogos/ncaa/500/194.png"), T("Michigan Wolverines","Michigan","Wolverines","MICH","00274c","https://a.espncdn.com/i/teamlogos/ncaa/500/130.png"), T("Boston College Eagles","Boston College","Eagles","BC","8c2232","x"), T("Massachusetts Minutemen","Massachusetts","Minutemen","MASS","881c1c","x")];
const CF_RANK = { rankings: [{ name: "AP Top 25", ranks: [{ current: 3, team: { location: "Ohio State", name: "Buckeyes", abbreviation: "OSU" } }, { current: 12, team: { location: "Michigan", name: "Wolverines", abbreviation: "MICH" } }] }] };
const at = (hours) => new Date(Date.now() + hours * 3600_000).toISOString().replace(/\.\d+Z/, "Z");
const km = (ticker, title, bid, ask, occ, extra = {}) => ({ ticker, title, yes_bid_dollars: String(bid), yes_ask_dollars: String(ask), last_price_dollars: String((bid + ask) / 2), occurrence_datetime: occ, expected_expiration_time: occ, status: "active", result: "", ...extra });
const KALSHI_EVENTS = {
  KXPGAH2H: [
    { event_ticker: "KXPGAH2H-TEST26R3SSCHRMCI", title: "3rd Round Head-to-Head: Scheffler vs McIlroy", markets: [
      km("KXPGAH2H-TEST26R3SSCHRMCI-SSCH", "Will Scottie Scheffler beat Rory McIlroy in the 3rd round of the Genesis Scottish Open?", 0.51, 0.53, at(30)),
      km("KXPGAH2H-TEST26R3SSCHRMCI-RMCI", "Will Rory McIlroy beat Scottie Scheffler in the 3rd round of the Genesis Scottish Open?", 0.46, 0.48, at(30)) ] },
    { event_ticker: "KXPGAH2H-TEST26R3LOPSIDED", title: "3rd Round Head-to-Head: A vs B", markets: [
      km("KXPGAH2H-TEST26R3LOPSIDED-A", "Will Jon Rahm beat Max Homa in the 3rd round of the Genesis Scottish Open?", 0.79, 0.81, at(30)),
      km("KXPGAH2H-TEST26R3LOPSIDED-B", "Will Max Homa beat Jon Rahm in the 3rd round of the Genesis Scottish Open?", 0.19, 0.21, at(30)) ] },
  ],
  KXF1H2H: [
    { event_ticker: "KXF1H2H-AZEGP26VERNOR", title: "F1 Matchup: Verstappen vs Norris", markets: [
      km("KXF1H2H-AZEGP26VERNOR-VER", "Will Max Verstappen finish ahead of Lando Norris at the Azerbaijan Grand Prix?", 0.47, 0.50, at(40)),
      km("KXF1H2H-AZEGP26VERNOR-NOR", "Will Lando Norris finish ahead of Max Verstappen at the Azerbaijan Grand Prix?", 0.50, 0.53, at(40)) ] },
  ],
};
const kalshiResults = {};
const texts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("the-odds-api.com")) {
    const p = new URL(u).pathname;
    if (p === "/v4/sports") return Response.json(Object.keys(FIXTURES).concat("basketball_nba").map((key) => ({ key, active: key !== "basketball_nba" })));
    const m = p.match(/sports\/(\w+)\/(odds|scores)/);
    if (m[2] === "odds") return Response.json(FIXTURES[m[1]] || [], { headers: { "x-requests-remaining": "19990" } });
    return Response.json(scores.filter((s) => s.sport_key === m[1]), { headers: { "x-requests-remaining": "19989" } });
  }
  if (u.includes("site.api.espn.com")) {
    if (u.includes("football/nfl/teams")) return Response.json({ sports: [{ leagues: [{ teams: NFL_T }] }] });
    if (u.includes("college-football/teams")) return Response.json({ sports: [{ leagues: [{ teams: CF_T }] }] });
    if (u.includes("college-football/rankings")) return Response.json(CF_RANK);
    if (u.includes("/rankings")) return Response.json({ rankings: [] });
    return Response.json({ sports: [{ leagues: [{ teams: [] }] }] });
  }
  if (u.includes("kalshi.com")) {
    const q = new URL(u).searchParams;
    if (u.includes("/events")) return Response.json({ events: KALSHI_EVENTS[q.get("series_ticker")] || [], cursor: "" });
    if (u.includes("/markets")) {
      const ev = Object.values(KALSHI_EVENTS).flat().find((e) => e.event_ticker === q.get("event_ticker"));
      return Response.json({ markets: (ev?.markets || []).map((m) => ({ ...m, ...(kalshiResults[m.ticker] || {}) })) });
    }
  }
  if (u.includes("api.twilio.com")) { texts.push(Object.fromEntries(opts.body)); return Response.json({ sid: "SM1" }, { status: 201 }); }
  return realFetch(url, opts);
};

const { db, syncOdds, syncScores, flushSms, pickSpread, syncTeams, syncH2H, settleH2H, h2hTitle } = await import("../netlify/functions/lib/server.mjs");
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
const log = (m) => console.log("  ·", m);
const sb = db();

assert(pickSpread(FIXTURES.americanfootball_nfl[0]).spread === -6.5, "pickSpread fav");
assert(pickSpread({ home_team: "A", bookmakers: [{ key: "x", markets: [{ key: "spreads", outcomes: [{ name: "A", point: 0 }, { name: "B", point: 0 }] }] }] }).spread === 0, "pick'em");

const mode = process.argv[2] || "seed";
assert(h2hTitle("3rd round of the Genesis Scottish Open") === "Round 3 · Genesis Scottish Open", "h2h title");
if (mode === "seed") {
  await syncTeams(sb, log);
  await syncOdds(sb, log);
  await syncH2H(sb, log);
  const { data } = await sb.from("games").select("*");
  const ids = data.map((g) => g.id).sort().join(",");
  assert(!data.some((g) => g.sport === "MLB"), "MLB switched off");
  assert(data.some((g) => g.id === "cf1") && !data.some((g) => g.id === "cf2"), "NCAAF: only games with a Top 25 team: " + ids);
  assert(data.some((g) => g.id === "KXPGAH2H-TEST26R3SSCHRMCI") && !data.some((g) => g.id === "KXPGAH2H-TEST26R3LOPSIDED"), "golf: even matchups only: " + ids);
  const golf = data.find((g) => g.id === "KXPGAH2H-TEST26R3SSCHRMCI");
  assert(golf.away === "Scottie Scheffler" && golf.home === "Rory McIlroy" && golf.kind === "h2h" && golf.title === "Round 3 · Genesis Scottish Open", "golf row " + JSON.stringify(golf));
  assert(data.some((g) => g.id === "KXF1H2H-AZEGP26VERNOR" && g.sport === "F1"), "F1 matchup");
  const { data: t } = await sb.from("teams").select("*").eq("league", "college-football");
  assert(t.find((x) => x.short_name === "Ohio State").rank === 3, "rank stored");
  assert(Number(data.find((g) => g.id === "nfl1").spread) === -6.5 && data.find((g) => g.id === "nfl1").fav_team === "Buffalo Bills", "Bills -6.5");
  console.log("SEED OK");
} else if (mode === "h2hsettle") {
  // Round is under way, then Kalshi finalizes: Rory wins
  await sb.from("games").update({ commence_time: new Date(Date.now() - 3600_000).toISOString(), status: "live" }).eq("id", "KXPGAH2H-TEST26R3SSCHRMCI");
  await settleH2H(sb, log);
  let { data: g } = await sb.from("games").select("*").eq("id", "KXPGAH2H-TEST26R3SSCHRMCI").single();
  assert(!g.settled, "not settled before Kalshi finalizes");
  kalshiResults["KXPGAH2H-TEST26R3SSCHRMCI-SSCH"] = { status: "finalized", result: "no" };
  kalshiResults["KXPGAH2H-TEST26R3SSCHRMCI-RMCI"] = { status: "finalized", result: "yes" };
  await settleH2H(sb, log);
  ({ data: g } = await sb.from("games").select("*").eq("id", "KXPGAH2H-TEST26R3SSCHRMCI").single());
  assert(g.settled && g.home_score === 1 && g.away_score === 0, "Rory (player B) won: " + JSON.stringify(g));
  console.log("H2H SETTLE OK");
} else if (mode === "settle") {
  // Kick off the Bills game in the past, then report a final: Bills 27, Dolphins 20 (Bills win by 7 → cover -6.5)
  await sb.from("games").update({ commence_time: new Date(Date.now() - 4 * 3600_000).toISOString(), status: "live" }).eq("id", "nfl1");
  await sb.rpc("expire_started");
  scores.push({ id: "nfl1", sport_key: "americanfootball_nfl", completed: true, home_team: "Buffalo Bills", away_team: "Miami Dolphins", scores: [{ name: "Buffalo Bills", score: "27" }, { name: "Miami Dolphins", score: "20" }] });
  await syncScores(sb, log);
  const { data: g } = await sb.from("games").select("*").eq("id", "nfl1").single();
  assert(g.settled && g.status === "final" && g.home_score === 27, "game settled " + JSON.stringify(g));
  const n = await flushSms(sb, log);
  console.log(`  · sent ${n} texts`); texts.forEach((t) => console.log("    →", t.To, t.Body));
  assert(texts.every((t) => !t.Body.includes("{link}")), "link substituted");
  console.log("SETTLE OK");
}

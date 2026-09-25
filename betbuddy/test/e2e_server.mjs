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
  if (u.includes("api.twilio.com")) { texts.push(Object.fromEntries(opts.body)); return Response.json({ sid: "SM1" }, { status: 201 }); }
  return realFetch(url, opts);
};

const { db, syncOdds, syncScores, flushSms, pickSpread } = await import("../netlify/functions/lib/server.mjs");
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
const log = (m) => console.log("  ·", m);
const sb = db();

assert(pickSpread(FIXTURES.americanfootball_nfl[0]).spread === -6.5, "pickSpread fav");
assert(pickSpread({ home_team: "A", bookmakers: [{ key: "x", markets: [{ key: "spreads", outcomes: [{ name: "A", point: 0 }, { name: "B", point: 0 }] }] }] }).spread === 0, "pick'em");

const mode = process.argv[2] || "seed";
if (mode === "seed") {
  await syncOdds(sb, log);
  const { data } = await sb.from("games").select("*");
  assert(data.length === 9, "9 games stored, got " + data.length);
  assert(data.find((g) => g.id === "mlb2").spread === null, "no-line game stored without spread");
  assert(Number(data.find((g) => g.id === "nfl1").spread) === -6.5 && data.find((g) => g.id === "nfl1").fav_team === "Buffalo Bills", "Bills -6.5");
  console.log("SEED OK");
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

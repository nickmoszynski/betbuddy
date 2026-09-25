// Admin-only "Refresh games now" button. Verifies the caller is an admin
// using their Supabase session token, then runs a full sync immediately.
import { db, syncOdds, syncScores, flushSms, flushPush, syncTeams, syncH2H, settleH2H } from "./lib/server.mjs";

export default async (req) => {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  const sb = db();
  const { data: { user } = {} } = await sb.auth.getUser(token);
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!prof?.is_admin) return Response.json({ error: "Admins only" }, { status: 403 });

  const log = [];
  try {
    const add = (m) => log.push(m);
    await syncTeams(sb, add);
    if (process.env.ODDS_API_KEY) { await syncOdds(sb, add); await syncScores(sb, add); }
    await syncH2H(sb, add);
    await settleH2H(sb, add);
    await flushPush(sb, (m) => log.push(m));
    await flushSms(sb, (m) => log.push(m));
    return Response.json({ ok: true, log });
  } catch (e) {
    return Response.json({ error: e.message, log }, { status: 500 });
  }
};

export const config = { path: "/api/sync-now" };

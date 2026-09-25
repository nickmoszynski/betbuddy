// Local test-only stand-in for Supabase (Auth + PostgREST subset) on top of
// a real Postgres database, so the real app and real SQL can be exercised
// end-to-end without Docker. NOT used in production.
import http from "node:http";
import pg from "pg";

const pool = new pg.Pool({ host: "127.0.0.1", user: "postgres", password: "pg", database: process.env.DB || "bbtest" });
const PORT = Number(process.env.PORT || 54321);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, role = "authenticated") => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role, aud: role, exp: Math.floor(Date.now() / 1000) + 86400 * 30, phone: "" })}.sig`;
const claims = (auth) => { try { return JSON.parse(Buffer.from(auth.replace(/^Bearer /, "").split(".")[1], "base64url")); } catch { return null; } };
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error("bad identifier " + s); return `"${s}"`; };
const EMBED = { games: ["games", "game_id"] };

async function asUser(req, fn) {
  const c = claims(req.headers.authorization || "");
  const role = c?.role === "service_role" ? "service_role" : c?.sub ? "authenticated" : "anon";
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [c?.sub || ""]);
    const r = await fn(client);
    await client.query("commit");
    return r;
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
  finally { client.release(); }
}

function parseFilters(params, vals) {
  const where = [];
  const cond = (col, opval) => {
    const i = opval.indexOf("."); const op = opval.slice(0, i); let v = opval.slice(i + 1);
    const c = ident(col);
    if (op === "is") return `${c} is ${v === "null" ? "null" : v === "true" ? "true" : "false"}`;
    if (op === "in") { const list = v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")); vals.push(list); return `${c} = any($${vals.length})`; }
    const m = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
    if (!m) throw new Error("op " + op);
    vals.push(v.replace(/^"|"$/g, "")); return `${c} ${m} $${vals.length}`;
  };
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or") {
      const parts = v.replace(/^\(|\)$/g, "").split(",").map((p) => { const [col, ...rest] = p.split("."); return cond(col, rest.join(".")); });
      where.push(`(${parts.join(" or ")})`);
    } else where.push(cond(k, v));
  }
  return where.length ? " where " + where.join(" and ") : "";
}

function selectList(sel = "*") {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of sel) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { out.push(cur); cur = ""; } else cur += ch; }
  if (cur) out.push(cur);
  return out.map((p) => {
    p = p.trim();
    const m = p.match(/^(\w+)\((.*)\)$/);
    if (m) { const [tbl, fk] = EMBED[m[1]]; return `(select row_to_json(e) from ${ident(tbl)} e where e.id = t.${ident(fk)}) as ${ident(m[1])}`; }
    return p === "*" ? "t.*" : `t.${ident(p)}`;
  }).join(", ");
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, "http://x");
  let raw = ""; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  try {
    // ── Auth ──
    if (url.pathname === "/auth/v1/otp") return send(res, 200, {});
    if (url.pathname === "/auth/v1/verify" || (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token")) {
      let id, phone;
      if (url.pathname.endsWith("verify")) {
        if (body.token !== "123456") return send(res, 400, { error: "invalid", msg: "Token has expired or is invalid", message: "Token has expired or is invalid" });
        phone = body.phone.replace(/\D/g, "");
        const r = await pool.query("select id from auth.users where regexp_replace(phone,'\\D','','g') = $1", [phone]);
        id = r.rows[0]?.id || (await pool.query("insert into auth.users (phone) values ($1) returning id", ["+" + phone])).rows[0].id;
      } else { id = body.refresh_token; phone = ""; }
      const user = { id, phone, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      return send(res, 200, { access_token: jwt(id), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: id, user });
    }
    if (url.pathname === "/auth/v1/user") {
      const c = claims(req.headers.authorization || "");
      if (!c?.sub) return send(res, 401, { message: "no user" });
      return send(res, 200, { id: c.sub, aud: "authenticated", role: "authenticated", phone: "" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);

    // ── RPC ──
    const rpcM = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpcM) {
      const names = Object.keys(body);
      const args = names.map((n, i) => `${ident(n)} => $${i + 1}`).join(", ");
      const r = await asUser(req, (c) => c.query(`select * from public.${ident(rpcM[1])}(${args})`, names.map((n) => body[n])));
      const cols = r.fields.map((f) => f.name);
      const setReturning = cols.length > 1 || (cols.length === 1 && cols[0] !== rpcM[1]);
      if (setReturning) return send(res, 200, r.rows);
      const v = r.rows[0]?.[rpcM[1]];
      return send(res, 200, v === undefined ? null : v);
    }

    // ── Tables ──
    const tm = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!tm) return send(res, 404, { message: "not found" });
    const table = ident(tm[1]);
    const vals = [];
    const where = parseFilters(url.searchParams, vals);
    const single = (req.headers.accept || "").includes("vnd.pgrst.object");
    const prefer = req.headers.prefer || "";
    const wantRows = prefer.includes("return=representation");
    let r;
    if (req.method === "GET" || req.method === "HEAD") {
      const order = url.searchParams.get("order");
      const ord = order ? " order by " + order.split(",").map((o) => { const [c, d] = o.split("."); return `t.${ident(c)} ${d === "desc" ? "desc" : "asc"}`; }).join(", ") : "";
      const lim = url.searchParams.get("limit") ? ` limit ${Number(url.searchParams.get("limit"))}` : "";
      r = await asUser(req, (c) => c.query(`select ${selectList(url.searchParams.get("select") || "*")} from public.${table} t${where}${ord}${lim}`, vals));
      if (req.method === "HEAD") return send(res, 200, undefined, { "content-range": `0-0/${r.rowCount}` });
      if (single) return r.rows.length === 1 ? send(res, 200, r.rows[0]) : send(res, 406, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" });
      return send(res, 200, r.rows, { "content-range": `0-${r.rowCount}/*` });
    }
    if (req.method === "PATCH") {
      const cols = Object.keys(body);
      const set = cols.map((k) => { vals.push(body[k]); return `${ident(k)} = $${vals.length}`; }).join(", ");
      r = await asUser(req, (c) => c.query(`update public.${table} t set ${set}${where} returning *`, vals));
    } else if (req.method === "DELETE") {
      r = await asUser(req, (c) => c.query(`delete from public.${table} t${where} returning *`, vals));
    } else if (req.method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      if (!rows.length) return send(res, 201, []);
      const cols = [...new Set(rows.flatMap(Object.keys))];
      const v2 = [];
      const tuples = rows.map((row) => "(" + cols.map((c) => { v2.push(row[c] ?? null); return `$${v2.length}`; }).join(",") + ")").join(",");
      const conflictCol = ident(url.searchParams.get("on_conflict") || (tm[1] === "sync_state" ? "key" : "id"));
      const upsert = prefer.includes("ignore-duplicates") ? ` on conflict (${conflictCol}) do nothing` : prefer.includes("merge-duplicates") ? ` on conflict (${ident(url.searchParams.get("on_conflict") || (tm[1] === "sync_state" ? "key" : "id"))}) do update set ${cols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}` : "";
      r = await asUser(req, (c) => c.query(`insert into public.${table} as t (${cols.map(ident).join(",")}) values ${tuples}${upsert} returning *`, v2));
    }
    if (!wantRows) return send(res, req.method === "POST" ? 201 : 204);
    return send(res, 200, single ? r.rows[0] : r.rows);
  } catch (e) {
    return send(res, e.message.includes("permission denied") ? 403 : 400, { message: e.message, code: e.code || "", details: null, hint: null });
  }
}).listen(PORT, () => console.log("shim on", PORT));

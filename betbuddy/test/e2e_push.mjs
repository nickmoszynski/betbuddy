// Push delivery test: real web-push encryption → fake push service (local HTTPS),
// decrypts what a phone would receive, and checks dead subscriptions get cleaned up.
import https from "node:https";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ece = require("http_ece");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = `${b64({ alg: "HS256" })}.${b64({ role: "service_role", exp: 4102444800 })}.sig`;
process.env.URL = "https://betbuddy.example";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const pg = createRequire(new URL("./shim/", import.meta.url))("pg");
const pool = new pg.Pool({ host: "127.0.0.1", user: "postgres", password: "pg", database: "bbe2e" });
const sql = async (q, v) => { const r = await pool.query(q, v); return r.rows[0] ? String(Object.values(r.rows[0])[0]) : ""; };
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };

// Fake phone: ECDH keypair + auth secret, like a browser subscription
const phone = crypto.createECDH("prime256v1"); phone.generateKeys();
const authSecret = crypto.randomBytes(16);

execSync("openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/claude-0/k.pem -out /tmp/claude-0/c.pem -days 1 -subj /CN=localhost 2>/dev/null");
const got = [];
const srv = https.createServer({ key: execSync("cat /tmp/claude-0/k.pem"), cert: execSync("cat /tmp/claude-0/c.pem") }, (req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c));
  req.on("end", () => { got.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(req.url === "/gone" ? 410 : 201); res.end(); });
}).listen(8443);

const user = await sql("insert into auth.users (phone) values ('+14135550199') returning id");
await sql(`update profiles set name='Pushy' where id='${user}'`);
await sql(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('${user}', 'https://localhost:8443/good', '${phone.getPublicKey().toString("base64url")}', '${authSecret.toString("base64url")}'),
  ('${user}', 'https://localhost:8443/gone', '${phone.getPublicKey().toString("base64url")}', '${authSecret.toString("base64url")}')`);
await sql(`select notify($1, 'BET_RECEIVED', 'Dad challenged you — $25', 'You''d get Dolphins +6.5 · Dolphins @ Bills')`, [user]);

const { db, flushPush } = await import("../netlify/functions/lib/server.mjs");
const n = await flushPush(db(), console.log);
srv.close();
assert(n === 2 && got.length === 2, `2 deliveries, got ${n}/${got.length}`);
const good = got.find((g) => g.path === "/good");
assert(/^vapid t=.+, k=.+/.test(good.headers.authorization), "VAPID auth header");
assert(good.headers["content-encoding"] === "aes128gcm", "encrypted payload");
const plain = JSON.parse(ece.decrypt(good.body, { version: "aes128gcm", privateKey: phone, authSecret: authSecret.toString("base64url") }).toString());
console.log("  · phone decrypted:", plain);
assert(plain.title.startsWith("Dad challenged you") && plain.url === "/?tab=inbox", "payload content");
assert(await sql("select count(*) from push_subscriptions where endpoint like '%/gone'") === "0", "dead subscription removed");
assert(await sql("select count(*) from app_config where key like 'vapid%'") === "2", "signing keys auto-created");
assert((await flushPush(db())) === 0, "nothing sent twice");
console.log("PUSH DELIVERY OK");
await pool.end();

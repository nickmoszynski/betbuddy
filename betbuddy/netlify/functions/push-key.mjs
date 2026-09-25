// Public half of the push-signing key, needed by the browser to subscribe.
import { db, vapidKeys } from "./lib/server.mjs";

export default async () => {
  try {
    const k = await vapidKeys(db());
    return Response.json({ publicKey: k.vapid_public }, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/api/push-key" };

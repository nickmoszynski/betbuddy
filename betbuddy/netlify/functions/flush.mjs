// The app pings this right after an action (challenge sent, accepted…) so the
// push notification goes out in seconds instead of waiting for the next
// minute tick. It only sends what the database already queued.
import { db, flushPush, flushSms } from "./lib/server.mjs";

export default async () => {
  try {
    const sb = db();
    const pushed = await flushPush(sb);
    const texted = await flushSms(sb);
    return Response.json({ pushed, texted });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/api/flush" };

// Runs every minute on Netlify: sends queued texts, refreshes lines,
// pulls scores for games with money on them, and auto-settles finals.
import { tick } from "./lib/server.mjs";

export default async () => {
  await tick();
  return new Response("ok");
};

export const config = { schedule: "* * * * *" };

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

// Call a database function; throws a friendly Error on failure
export async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ""));
  return data;
}

// Nudge the server to send queued push notifications right away (best effort)
export const flushTexts = () => fetch("/api/flush", { method: "POST" }).catch(() => {});

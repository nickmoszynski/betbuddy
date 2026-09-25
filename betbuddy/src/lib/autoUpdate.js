// Keeps home-screen installs current: when a new version is deployed,
// the app notices (on open, on return to the app, and every 5 minutes) and reloads itself.
const current = () => [...document.scripts].map((s) => s.getAttribute("src")).find((s) => s && s.includes("/assets/"));

async function check() {
  try {
    const html = await fetch(`/?v=${Date.now()}`, { cache: "no-store" }).then((r) => r.text());
    const latest = /<script[^>]+src="([^"]*\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    const mine = current();
    if (latest && mine && !mine.endsWith(latest) && !latest.endsWith(mine)) {
      const n = Number(sessionStorage.getItem("bb_reloads") || 0);
      if (n < 3) { sessionStorage.setItem("bb_reloads", String(n + 1)); location.reload(); }
    }
  } catch { /* offline — try again later */ }
}

export function startAutoUpdate() {
  if (import.meta.env.DEV) return;
  setTimeout(check, 3000);
  setInterval(check, 5 * 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
}

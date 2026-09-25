// Formatting helpers + mapping database rows into the shapes the UI uses
export const SPORT_COLOR = { NFL: "#3DD68C", NCAAF: "#22D3EE", NBA: "#E8762B", NCAAB: "#F25F5C", MLB: "#4F9CF9", NHL: "#A78BFA" };
// "The Field" (open bets any buddy can take) is switched off: every bet is 1-on-1 with a named buddy.
export const FIELD_ENABLED = false;
export const BANK_VENMO = (import.meta.env.VITE_BANK_VENMO || "").replace(/^@/, "");

export const shortName = (n = "") => n.split(" ").pop();
export const getDog = (g) => (g.favTeam === g.home ? g.away : g.home);
export const other = (side) => (side === "fav" ? "dog" : "fav");
export const fmtNum = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));

// "Bills -2.5" / "Dolphins +2.5" / "Bills PK"
export function sideLabel(g, side) {
  const sp = Number(g.spread);
  if (side === "fav") return `${shortName(g.favTeam)} ${sp === 0 ? "PK" : fmtNum(sp)}`;
  return `${shortName(getDog(g))} ${sp === 0 ? "PK" : "+" + fmtNum(Math.abs(sp))}`;
}
// Spread text shown next to a team: "-2.5" / "+2.5" / "PK"
export function teamLine(g, team) {
  const sp = Number(g.spread);
  if (sp === 0) return "PK";
  return team === g.favTeam ? fmtNum(sp) : "+" + fmtNum(Math.abs(sp));
}
export const teamForSide = (g, side) => (side === "fav" ? g.favTeam : getDog(g));

export function initials(name = "") {
  return name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() || "").join("").slice(0, 2) || "?";
}

export function fmtPhone(v = "") {
  const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - new Date(ts)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function mapProfile(p) {
  return { id: p.id, name: p.name || "New Buddy", phone: p.phone, color: p.color || "#D4A843", initials: initials(p.name), photo: p.photo_url, venmo: p.venmo };
}

// Prime time = night games in football
function importance(g) {
  const hourET = Number(new Date(g.commence_time).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  if ((g.sport === "NFL" || g.sport === "NCAAF") && hourET >= 19) return 3;
  return 1;
}

export function mapGame(g, counts = {}) {
  return {
    id: g.id, sport: g.sport, home: g.home, away: g.away,
    homeScore: g.home_score, awayScore: g.away_score, status: g.status, settled: g.settled,
    spread: g.spread == null ? null : Number(g.spread), favTeam: g.fav_team,
    date: g.commence_time, importance: importance(g), wagerCount: counts[g.id] || 0,
  };
}

export function mapWager(w, gamesById) {
  const base = gamesById[w.game_id] || { id: w.game_id, sport: "", home: "?", away: "?", date: null };
  const game = { ...base, spread: Number(w.spread), favTeam: w.fav_team }; // the agreed line
  return {
    id: w.id, gameId: w.game_id, game,
    from: w.from_user, to: w.to_user || "field", toField: !w.to_user,
    side: w.side, sideLabel: sideLabel(game, w.side), otherSideLabel: sideLabel(game, other(w.side)),
    amount: w.amount, status: w.status, winner: w.winner, message: w.message,
    createdAt: w.created_at, settledAt: w.settled_at,
  };
}

// Is `side` covering right now, given live scores?
export function coverState(game, side) {
  if (game.homeScore == null || game.awayScore == null) return null;
  const favScore = game.favTeam === game.home ? game.homeScore : game.awayScore;
  const dogScore = game.favTeam === game.home ? game.awayScore : game.homeScore;
  const margin = favScore - dogScore + Number(game.spread);
  const favCover = margin > 0 ? true : margin < 0 ? false : null;
  if (favCover === null) return "push";
  return (side === "fav") === favCover ? "covering" : "losing";
}

// Resize an image file to a small square JPEG data URL (for profile photos)
export function resizePhoto(file, size = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export const venmoPayUrl = (handle, amount, note) =>
  `https://venmo.com/${encodeURIComponent(handle.replace(/^@/, ""))}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`;

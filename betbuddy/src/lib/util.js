// Formatting helpers + mapping database rows into the shapes the UI uses
import { teamInfo, rankOf } from "./teams.js";
export const SPORT_COLOR = { NFL: "#3DD68C", NCAAF: "#22D3EE", NBA: "#E8762B", NCAAB: "#F25F5C", GOLF: "#A3E635", F1: "#F43F5E", MLB: "#4F9CF9", NHL: "#A78BFA" };
// Sports shown on the Games board (MLB/NHL off: run-line/puck-line bets aren't even money)
export const ENABLED_SPORTS = ["NFL", "NCAAF", "NBA", "NCAAB", "GOLF", "F1"];
// "The Field" (open bets any buddy can take) is switched off: every bet is 1-on-1 with a named buddy.
export const FIELD_ENABLED = false;
export const BANK_VENMO = (import.meta.env.VITE_BANK_VENMO || "").replace(/^@/, "");

// "Bills", "Ohio State" (colleges show the school), "McIlroy" (people show the last name)
export const shortName = (n = "") => teamInfo(n)?.short || n.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/, "").split(" ").pop();
export const isH2H = (g) => g?.kind === "h2h";
// "Dolphins @ Bills", "#3 Ohio State @ Michigan", "Scheffler vs McIlroy"
export const matchupText = (g) => (g?.kind === "h2h" ? `${shortName(g.away)} vs ${shortName(g.home)}` : `${rankedName(g, g?.away)} @ ${rankedName(g, g?.home)}`);
// "#3 Ohio State" when the team is ranked in that sport's AP poll
// College teams we can't look up yet show their full name ("North Dakota State Bison"), never just the mascot
const COLLEGE = ["NCAAF", "NCAAB"];
export const teamLabel = (g, team = "") => (isH2H(g) || !COLLEGE.includes(g?.sport) || teamInfo(team) ? shortName(team) : team);
export const rankedName = (g, team) => { const r = g && rankOf(g.sport, team); return `${r ? `#${r} ` : ""}${teamLabel(g, team)}`; };
export const getDog = (g) => (g.favTeam === g.home ? g.away : g.home);
export const other = (side) => (side === "fav" ? "dog" : "fav");
export const fmtNum = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));

// "Bills -2.5" / "Dolphins +2.5" / "Bills PK"
export function sideLabel(g, side) {
  if (isH2H(g)) return shortName(side === "fav" ? g.favTeam : getDog(g));
  const sp = Number(g.spread);
  if (side === "fav") return `${teamLabel(g, g.favTeam)} ${sp === 0 ? "PK" : fmtNum(sp)}`;
  return `${teamLabel(g, getDog(g))} ${sp === 0 ? "PK" : "+" + fmtNum(Math.abs(sp))}`;
}
// Spread text shown next to a team: "-2.5" / "+2.5" / "PK"
export function teamLine(g, team) {
  if (isH2H(g)) { const p = team === g.away ? g.ext?.a?.p : g.ext?.b?.p; return p != null ? `${Math.round(p * 100)}%` : "Even"; }
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
// Prime time = NFL night games (TNF / SNF / MNF), kickoff 7:30pm ET or later
function importance(g) {
  if (g.sport !== "NFL") return 1;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(g.commence_time));
  const h = Number(parts.find((p) => p.type === "hour")?.value), m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m >= 19 * 60 + 30 ? 3 : 1;
}

export function mapGame(g, counts = {}) {
  return {
    id: g.id, sport: g.sport, home: g.home, away: g.away,
    homeScore: g.home_score, awayScore: g.away_score, status: g.status, settled: g.settled,
    spread: g.spread == null ? null : Number(g.spread), favTeam: g.fav_team,
    date: g.commence_time, importance: g.kind === "h2h" ? 1 : importance(g), wagerCount: counts[g.id] || 0,
    kind: g.kind || "game", title: g.title, ext: g.ext,
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

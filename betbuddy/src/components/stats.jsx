import { useCallback, useEffect, useState } from "react";
import { F, Avatar, Label, CloseBtn } from "./ui.jsx";
import { rpc } from "../lib/supabase.js";
import { SPORT_COLOR, shortName, initials, timeAgo } from "../lib/util.js";

// Chart colors (validated for the dark surface: lightness band + ≥3:1 contrast)
const BAR = "#BF8A2E";
const BAR_HOVER = "#E8A838";
const INK = "#F0EDE8", INK2 = "rgba(240,237,232,.72)", INK3 = "rgba(240,237,232,.5)";
const GRID = "rgba(255,255,255,.08)";
const card = { background: "#13151C", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "12px 14px", marginBottom: 10 };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const money = (n) => `$${Number(n || 0).toLocaleString()}`;
const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" });

// Admin-only analytics: players, activity, bet volume, top games, leaderboard
export function StatsScreen({ onClose, toast }) {
  const [days, setDays] = useState(30);
  const [s, setS] = useState(null);
  const load = useCallback(() => rpc("admin_stats", { p_days: days }).then(setS).catch((e) => toast("ERROR", e.message)), [days, toast]);
  useEffect(() => { load(); }, [load]);

  const b = s?.bets || {}, u = s?.users || {};
  const resolved = (b.accepted || 0) + (b.declined || 0) + (b.expired || 0);
  const acceptRate = resolved ? Math.round((100 * (b.accepted || 0)) / resolved) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0A0B0F", zIndex: 950, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px calc(env(safe-area-inset-bottom) + 60px)", fontFamily: F, color: INK }}>
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(10,11,15,.96)", backdropFilter: "blur(12px)", margin: "0 -16px", padding: "calc(env(safe-area-inset-top) + 12px) 16px 12px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>📊 Dashboard</div>
            <div style={{ fontSize: 12, color: INK3 }}>Players, activity & betting volume</div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {/* Filters: one row, above everything */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: "7px 14px", borderRadius: 20, fontFamily: F, fontWeight: 700, fontSize: 12, cursor: "pointer", border: `1.5px solid ${days === d ? "#E8A838" : "rgba(255,255,255,.12)"}`, background: days === d ? "rgba(232,168,56,.14)" : "transparent", color: days === d ? "#E8A838" : INK2 }}>
              {d} days
            </button>
          ))}
          <button onClick={load} style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,.12)", background: "transparent", color: INK2, fontFamily: F, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>⟳ Refresh</button>
        </div>

        {!s ? <div style={{ color: INK3, padding: 40, textAlign: "center" }}>Loading…</div> : (
          <>
            {/* Headline numbers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <Tile label="Players" value={u.total} sub={`+${u.new_7d} this week`} />
              <Tile label="Active today" value={u.active_today} sub={`${u.active_7d} this week · ${u.opens_7d} opens`} />
              <Tile label="Bets placed" value={b.accepted} sub={`+${b.bets_7d} this week · ${b.open} open`} />
              <Tile label="Total $ volume" value={money(b.handle)} sub={`${money(b.handle_7d)} this week`} />
              <Tile label="Avg bet" value={money(b.avg_stake)} sub="per side" />
              <Tile label="Alerts on" value={`${u.push_on}/${u.total}`} sub={`${u.funded} players funded`} />
            </div>

            <BarChart title="Bets per day" data={s.bets_by_day} unit={(n) => `${n} bet${n === 1 ? "" : "s"}`} />
            <BarChart title="$ volume per day" data={s.bets_by_day.map((d) => ({ day: d.day, n: d.volume }))} unit={money} />
            <BarChart title="Active players per day" data={s.active_by_day} peak unit={(n) => `${n} player${n === 1 ? "" : "s"}`} />
            <BarChart title="New signups per day" data={s.signups_by_day} unit={(n) => `${n} signup${n === 1 ? "" : "s"}`} />

            {/* Challenge funnel */}
            <div style={card}>
              <Label>CHALLENGES</Label>
              <Row k="Sent" v={b.sent} />
              <Row k="Accepted" v={b.accepted} />
              <Row k="Declined" v={b.declined} />
              <Row k="Expired / cancelled" v={b.expired} />
              <Row k="Waiting for a reply" v={b.pending} />
              {acceptRate !== null && <div style={{ fontSize: 12, color: INK2, marginTop: 6 }}><b style={{ color: INK }}>{acceptRate}%</b> of answered challenges get accepted</div>}
            </div>

            {s.biggest && (
              <div style={{ ...card, border: "1px solid rgba(232,168,56,.35)" }}>
                <Label>BIGGEST BET</Label>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{money(s.biggest.amount)} <span style={{ fontSize: 13, fontWeight: 600, color: INK2 }}>each side</span></div>
                <div style={{ fontSize: 13, color: INK2, marginTop: 2 }}>
                  {s.biggest.from} vs {s.biggest.to} · {shortName(s.biggest.away)} @ {shortName(s.biggest.home)}
                  {s.biggest.status === "settled" ? ` · ${s.biggest.winner ? `${s.biggest.winner} won` : "push"}` : " · in play"}
                </div>
              </div>
            )}

            <div style={card}>
              <Label>MOST-BET GAMES</Label>
              {s.top_games.length === 0 && <Muted>No bets yet.</Muted>}
              {s.top_games.map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${GRID}` : "none" }}>
                  <div style={{ width: 18, fontWeight: 900, color: INK3, fontSize: 13 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{shortName(g.away)} @ {shortName(g.home)}</div>
                    <div style={{ fontSize: 11, color: INK3 }}><SportDot sport={g.sport} />{g.sport} · {new Date(g.commence_time).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{g.bets} bet{g.bets === 1 ? "" : "s"}</div>
                    <div style={{ fontSize: 11, color: INK2 }}>{money(g.volume)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={card}>
              <Label>BY SPORT</Label>
              {s.by_sport.length === 0 && <Muted>No bets yet.</Muted>}
              {s.by_sport.map((r) => {
                const max = Math.max(...s.by_sport.map((x) => x.volume));
                return (
                  <div key={r.sport} style={{ marginBottom: 8 }} title={`${r.sport}: ${r.bets} bets, ${money(r.volume)}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700 }}><SportDot sport={r.sport} />{r.sport}</span>
                      <span style={{ color: INK2 }}>{plural(r.bets, "bet")} · {money(r.volume)}</span>
                    </div>
                    <div style={{ height: 8, background: "rgba(255,255,255,.05)", borderRadius: 4 }}>
                      <div style={{ width: `${Math.max(3, (100 * r.volume) / max)}%`, height: 8, background: BAR, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={card}>
              <Label>PLAYERS</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 54px 60px 64px", gap: 6, fontSize: 10, fontWeight: 700, color: INK3, letterSpacing: "1px", paddingBottom: 6 }}>
                <span>NAME</span><span style={{ textAlign: "right" }}>W-L-P</span><span style={{ textAlign: "right" }}>NET</span><span style={{ textAlign: "right" }}>WAGERED</span>
              </div>
              {s.leaderboard.map((p) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 54px 60px 64px", gap: 6, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${GRID}`, fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Avatar contact={{ name: p.name, color: p.color, initials: initials(p.name), photo: p.photo_url }} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: INK3 }}>{p.last_seen ? `seen ${timeAgo(p.last_seen)}` : "not seen yet"} · {plural(p.bets, "bet")}</div>
                    </div>
                  </div>
                  <span style={{ textAlign: "right", color: INK2 }}>{p.wins}-{p.losses}-{p.pushes}</span>
                  <span style={{ textAlign: "right", fontWeight: 800 }}>{p.net > 0 ? "▲ " : p.net < 0 ? "▼ " : ""}{money(Math.abs(p.net))}</span>
                  <span style={{ textAlign: "right", color: INK2 }}>{money(p.wagered)}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: INK3, lineHeight: 1.5, padding: "4px 2px" }}>
              "Volume" counts both sides of every accepted bet (a $25 bet = $50 volume). For raw site traffic (page loads, bandwidth), see Netlify → your project → Observability.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div style={{ ...card, marginBottom: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: INK3, letterSpacing: "1.2px" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.15, marginTop: 2 }}>{value ?? 0}</div>
      {sub && <div style={{ fontSize: 11, color: INK2, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
const Row = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span style={{ color: INK2 }}>{k}</span><b>{v ?? 0}</b></div>
);
const Muted = ({ children }) => <div style={{ fontSize: 13, color: INK3, padding: "6px 0" }}>{children}</div>;
const SportDot = ({ sport }) => <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: SPORT_COLOR[sport] || "#888", marginRight: 5, verticalAlign: 1 }} />;

// Single-series daily bar chart with a hover/tap readout
function BarChart({ title, data = [], unit, peak }) {
  const [hi, setHi] = useState(null);
  const W = 452, H = 110, top = 8, bottom = 18;
  const max = Math.max(1, ...data.map((d) => Number(d.n)));
  const total = data.reduce((a, d) => a + Number(d.n), 0);
  const slot = W / Math.max(1, data.length);
  const bw = Math.max(2, slot - 2);
  const h = (v) => ((H - top - bottom) * v) / max;
  const focus = hi !== null ? data[hi] : null;
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <Label style={{ marginBottom: 0 }}>{title.toUpperCase()}</Label>
        <div style={{ fontSize: 12, color: focus ? INK : INK2, fontWeight: focus ? 700 : 500 }}>
          {focus ? `${dayLabel(focus.day)} · ${unit(Number(focus.n))}` : peak ? `Busiest day ${unit(max)}` : `Total ${unit(total)}`}
        </div>
      </div>
      {total === 0 ? <Muted>Nothing yet in this range.</Muted> : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", touchAction: "pan-y" }} role="img" aria-label={`${title}: total ${unit(total)}`}
          onPointerLeave={() => setHi(null)}>
          <line x1="0" x2={W} y1={top} y2={top} stroke={GRID} strokeDasharray="3 4" />
          <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} stroke="rgba(255,255,255,.18)" />
          {data.map((d, i) => {
            const v = Number(d.n), bh = h(v), x = i * slot + (slot - bw) / 2, y = H - bottom - bh;
            return (
              <g key={d.day} onPointerEnter={() => setHi(i)} onClick={() => setHi(i)}>
                <rect x={i * slot} y={0} width={slot} height={H - bottom} fill="transparent" />
                {v > 0 && <path d={roundTop(x, y, bw, bh, Math.min(4, bw / 2, bh))} fill={hi === i ? BAR_HOVER : BAR} />}
              </g>
            );
          })}
          <text x="0" y={H - 4} fill={INK3} fontSize="10" fontFamily="DM Sans, sans-serif">{data[0] && dayLabel(data[0].day)}</text>
          <text x={W} y={H - 4} fill={INK3} fontSize="10" fontFamily="DM Sans, sans-serif" textAnchor="end">Today</text>
          <text x="2" y={top + 11} fill={INK3} fontSize="10" fontFamily="DM Sans, sans-serif">max {unit(max)}</text>
        </svg>
      )}
    </div>
  );
}
// Bar with rounded top corners, square at the baseline
function roundTop(x, y, w, h, r) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

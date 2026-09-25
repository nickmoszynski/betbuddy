import { useCallback, useEffect, useState } from "react";
import { F, GREEN_BTN, Avatar, Label, inputStyle, CloseBtn } from "./ui.jsx";
import { supabase, rpc, flushTexts } from "../lib/supabase.js";
import { mapProfile, timeAgo, venmoPayUrl, shortName, fmtPhone } from "../lib/util.js";

// The bank's control room: confirm Venmo deposits, send cash-outs, fix games.
export function AdminScreen({ onClose, toast, onChanged }) {
  const [sum, setSum] = useState(null);
  const [users, setUsers] = useState([]);
  const [deps, setDeps] = useState([]);
  const [wds, setWds] = useState([]);
  const [stuck, setStuck] = useState([]);
  const [adjust, setAdjust] = useState(null);
  const [scoreFor, setScoreFor] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const [s, u, d, w, l] = await Promise.all([
      rpc("admin_summary"),
      rpc("admin_users"),
      supabase.from("deposit_requests").select("*").eq("status", "pending").order("created_at"),
      supabase.from("withdrawal_requests").select("*").eq("status", "pending").order("created_at"),
      supabase.from("wagers").select("*, games(*)").eq("status", "locked"),
    ]);
    setSum(s); setUsers(u || []); setDeps(d.data || []); setWds(w.data || []);
    const cutoff = Date.now() - 5 * 3600_000;
    setStuck((l.data || []).filter((x) => new Date(x.games.commence_time).getTime() < cutoff));
  }, []);
  useEffect(() => { load().catch((e) => toast("ERROR", e.message)); }, [load, toast]);

  const byId = Object.fromEntries(users.map((u) => [u.id, { ...mapProfile(u), available: u.available }]));
  const act = (fn, okMsg) => async () => {
    try { await fn(); if (okMsg) toast("DEPOSIT", okMsg); flushTexts(); await load(); onChanged(); }
    catch (e) { toast("ERROR", e.message); }
  };
  const syncNow = async () => {
    setSyncing(true);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/sync-now", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` } }).then((x) => x.json()).catch((e) => ({ error: e.message }));
    setSyncing(false);
    if (r.error) toast("ERROR", "Sync failed", r.error); else toast("AUTO_SETTLE", "Games refreshed", (r.log || []).slice(-2).join(" · "));
    await load(); onChanged();
  };

  const card = { background: "#13151C", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "12px 14px", marginBottom: 8 };
  const btn = (bg, color, border = "none") => ({ padding: "10px 12px", background: bg, color, border, borderRadius: 10, fontFamily: F, fontWeight: 800, fontSize: 13, cursor: "pointer", flex: 1 });

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0A0B0F", zIndex: 900, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: F }}>🏦 The Bank</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.62)", fontFamily: F }}>Admin controls</div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {sum && (
          <div style={{ ...card, background: "linear-gradient(145deg,rgba(59,130,246,.12),rgba(59,130,246,.03))", border: "1px solid rgba(59,130,246,.25)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", fontFamily: F, marginBottom: 2 }}>Your Venmo should be holding</div>
            <div style={{ fontSize: 30, fontWeight: 900, fontFamily: F, color: "#60A5FA" }}>${sum.deposited - sum.paid_out}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", fontFamily: F, marginTop: 4, lineHeight: 1.6 }}>
              ${sum.available} in balances · ${sum.in_bets} riding on bets · ${sum.owed_cashouts} cash-outs owed<br />
              ${sum.deposited} deposited all-time · ${sum.paid_out} paid out · {sum.users} members
            </div>
          </div>
        )}
        <button onClick={syncNow} disabled={syncing} style={{ ...btn("rgba(255,255,255,.05)", "#F0EDE8", "1px solid rgba(255,255,255,.1)"), width: "100%", marginBottom: 20 }}>{syncing ? "Refreshing…" : "⟳ Refresh games & scores now"}</button>

        <Label>DEPOSITS TO CONFIRM ({deps.length})</Label>
        {deps.length === 0 && <div style={{ ...card, color: "rgba(255,255,255,.57)", fontFamily: F, fontSize: 13 }}>Nothing waiting.</div>}
        {deps.map((d) => (
          <div key={d.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Avatar contact={byId[d.user_id]} size={34} />
              <div style={{ flex: 1, fontFamily: F }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{byId[d.user_id]?.name} · <span style={{ color: "#3DD68C" }}>${d.amount}</span></div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.67)" }}>Look for Venmo note <b style={{ color: "#D4A843" }}>{d.code}</b> · {timeAgo(d.created_at)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={act(() => rpc("admin_resolve_deposit", { p_id: d.id, p_approve: true }), `Credited $${d.amount}`)} style={btn(GREEN_BTN, "#0A0B0F")}>✓ Received — credit it</button>
              <button onClick={act(() => rpc("admin_resolve_deposit", { p_id: d.id, p_approve: false }))} style={{ ...btn("rgba(242,95,92,.08)", "#F25F5C", "1px solid rgba(242,95,92,.3)"), flex: "0 0 auto" }}>Not found</button>
            </div>
          </div>
        ))}

        <Label style={{ marginTop: 18 }}>CASH-OUTS TO SEND ({wds.length})</Label>
        {wds.length === 0 && <div style={{ ...card, color: "rgba(255,255,255,.57)", fontFamily: F, fontSize: 13 }}>Nothing owed.</div>}
        {wds.map((w) => (
          <div key={w.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Avatar contact={byId[w.user_id]} size={34} />
              <div style={{ flex: 1, fontFamily: F }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{byId[w.user_id]?.name} · <span style={{ color: "#F97316" }}>${w.amount}</span></div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.67)" }}>to @{w.venmo} · requested {timeAgo(w.created_at)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a href={venmoPayUrl(w.venmo, w.amount, "BetBuddy cash out")} target="_blank" rel="noreferrer" style={{ ...btn("#3D95CE", "#fff"), textAlign: "center", textDecoration: "none" }}>Pay on Venmo</a>
              <button onClick={act(() => rpc("admin_resolve_withdrawal", { p_id: w.id, p_paid: true }), "Marked paid")} style={btn(GREEN_BTN, "#0A0B0F")}>✓ Paid</button>
              <button onClick={act(() => rpc("admin_resolve_withdrawal", { p_id: w.id, p_paid: false }))} style={{ ...btn("rgba(242,95,92,.08)", "#F25F5C", "1px solid rgba(242,95,92,.3)"), flex: "0 0 auto" }}>Refund</button>
            </div>
          </div>
        ))}

        <Label style={{ marginTop: 18 }}>BETS NEEDING ATTENTION ({stuck.length})</Label>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.57)", fontFamily: F, marginBottom: 8 }}>Locked bets whose game started 5+ hours ago and hasn't auto-settled (postponed, or the score feed missed it).</div>
        {stuck.map((x) => (
          <div key={x.id} style={card}>
            <div style={{ fontFamily: F, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {byId[x.from_user]?.name} vs {byId[x.to_user]?.name} · ${x.amount} · {shortName(x.games.away)} @ {shortName(x.games.home)} ({new Date(x.games.commence_time).toLocaleDateString()})
            </div>
            {scoreFor === x.game_id ? (
              <ScoreForm game={x.games} onCancel={() => setScoreFor(null)} onSubmit={(h, a) => act(async () => { await rpc("admin_final_score", { p_game_id: x.game_id, p_home: h, p_away: a }); setScoreFor(null); }, "Game settled")()} />
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setScoreFor(x.game_id)} style={btn("rgba(232,168,56,.12)", "#D4A843", "1px solid rgba(232,168,56,.35)")}>Enter final score</button>
                <button onClick={act(() => rpc("admin_void_wager", { p_id: x.id }), "Bet voided, both refunded")} style={btn("rgba(255,255,255,.05)", "#F0EDE8", "1px solid rgba(255,255,255,.1)")}>Void & refund both</button>
              </div>
            )}
          </div>
        ))}

        <Label style={{ marginTop: 18 }}>MEMBERS ({users.length})</Label>
        {users.map((u) => (
          <div key={u.id} style={{ ...card, display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar contact={byId[u.id]} size={34} />
            <div style={{ flex: 1, fontFamily: F, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name || "(no name yet)"} {u.is_admin && <span style={{ fontSize: 9, color: "#60A5FA" }}>ADMIN</span>}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.62)" }}>{u.phone ? fmtPhone(u.phone) : ""}{u.venmo ? ` · @${u.venmo}` : ""}</div>
            </div>
            <div style={{ fontFamily: F, fontWeight: 900, color: "#D4A843" }}>${u.available}</div>
            <button onClick={() => setAdjust({ id: u.id, name: u.name, amt: "", memo: "" })} style={{ background: "none", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, color: "rgba(255,255,255,.5)", fontSize: 11, padding: "5px 8px", cursor: "pointer", fontFamily: F }}>±</button>
          </div>
        ))}

        {adjust && (
          <div style={{ ...card, border: "1px solid rgba(232,168,56,.35)" }}>
            <div style={{ fontFamily: F, fontWeight: 800, marginBottom: 8 }}>Adjust {adjust.name}'s balance</div>
            <input value={adjust.amt} onChange={(e) => setAdjust({ ...adjust, amt: e.target.value.replace(/[^\d-]/g, "") })} placeholder="e.g. 20 or -20" style={{ ...inputStyle, marginBottom: 8 }} />
            <input value={adjust.memo} onChange={(e) => setAdjust({ ...adjust, memo: e.target.value })} placeholder="Reason (they'll see this)" style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={!Number(adjust.amt)} onClick={act(async () => { await rpc("admin_adjust", { p_user: adjust.id, p_amount: Number(adjust.amt), p_memo: adjust.memo }); setAdjust(null); }, "Balance adjusted")} style={btn(GREEN_BTN, "#0A0B0F")}>Apply</button>
              <button onClick={() => setAdjust(null)} style={btn("rgba(255,255,255,.05)", "#F0EDE8")}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreForm({ game, onSubmit, onCancel }) {
  const [a, setA] = useState(""); const [h, setH] = useState("");
  const box = { ...inputStyle, width: 70, textAlign: "center", padding: "10px" };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: F, fontSize: 12, flexWrap: "wrap" }}>
      {shortName(game.away)} <input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ""))} style={box} />
      {shortName(game.home)} <input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ""))} style={box} />
      <button disabled={a === "" || h === ""} onClick={() => onSubmit(Number(h), Number(a))} style={{ padding: "10px 14px", background: GREEN_BTN, border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>Settle</button>
      <button onClick={onCancel} style={{ background: "none", border: "none", color: "rgba(255,255,255,.62)", cursor: "pointer" }}>Cancel</button>
    </div>
  );
}

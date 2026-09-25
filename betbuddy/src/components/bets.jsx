import { useState, useRef, useEffect } from "react";
import { F, GOLD_BTN, GREEN_BTN, Avatar, TeamLogo, Sheet, CloseBtn, Label, inputStyle, AmountPicker, BigButton } from "./ui.jsx";
import { SPORT_COLOR, shortName, sideLabel, teamLine, teamForSide, other, fmtPhone, coverState } from "../lib/util.js";
import { getTeam } from "../lib/teams.js";

export const inviteLink = (me) => `${location.origin}/?invite=${me}`;
// Opens the sender's own Messages app with a pre-written text (a normal person-to-person text)
export const nudgeUrl = (phone, body) => {
  const sep = /iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?";
  return `sms:+${String(phone).replace(/\D/g, "").replace(/^(?=\d{10}$)/, "1")}${sep}body=${encodeURIComponent(body)}`;
};

/* ─── Contact Picker ─────────────────────────────────────────────── */
function ContactPicker({ contacts, friendIds, selected, onSelect, onInvite, fieldSelected, onSelectField }) {
  return (
    <div>
      <Label>SEND CHALLENGE TO</Label>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {friendIds.length > 0 && (
          <button onClick={onSelectField} style={pickBtn}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: fieldSelected ? "rgba(168,85,247,.15)" : "rgba(168,85,247,.06)", border: fieldSelected ? "2px solid #A855F7" : "2px solid rgba(168,85,247,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎲</div>
            <span style={{ fontSize: 10, fontWeight: fieldSelected ? 800 : 500, color: fieldSelected ? "#A855F7" : "rgba(255,255,255,.45)", fontFamily: F }}>The Field</span>
          </button>
        )}
        {friendIds.map((id) => {
          const c = contacts[id], sel = selected === id && !fieldSelected;
          return (
            <button key={id} onClick={() => onSelect(id)} style={pickBtn}>
              <div style={{ position: "relative" }}>
                <Avatar contact={c} size={48} showRing={sel} />
                {sel && <div style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: c.color, border: "2px solid #070C18", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 7, color: "#F0EDE8", fontWeight: 900 }}>✓</span></div>}
              </div>
              <span style={{ fontSize: 10, fontWeight: sel ? 800 : 500, color: sel ? c.color : "rgba(255,255,255,.45)", fontFamily: F, whiteSpace: "nowrap" }}>{c.name.split(" ")[0]}</span>
            </button>
          );
        })}
        <button onClick={onInvite} style={pickBtn}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(6,182,212,.07)", border: "2px dashed rgba(6,182,212,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📲</div>
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(6,182,212,.7)", fontFamily: F }}>Invite</span>
        </button>
      </div>
    </div>
  );
}
const pickBtn = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "2px 4px" };

/* ─── Invite by text (opens the phone's own Messages app) ─────────── */
export function InviteModal({ onClose, me, senderName, game }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const link = inviteLink(me);
  const msg = game
    ? `Hey${name ? ` ${name}` : ""}! ${senderName} wants to bet you on ${shortName(game.away)} vs ${shortName(game.home)} on BetBuddy. Join here: ${link}`
    : `Hey${name ? ` ${name}` : ""}! ${senderName} wants to bet with you on BetBuddy — friendly wagers, no bookie. Join here: ${link}`;
  const send = () => {
    if (digits.length < 10) return;
    const sep = /iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?";
    window.location.href = `sms:+1${digits.slice(-10)}${sep}body=${encodeURIComponent(msg)}`;
    setSent(true);
    setTimeout(onClose, 1800);
  };
  return (
    <Sheet onClose={onClose} z={800} border="rgba(6,182,212,.15)">
      {sent ? (
        <div style={{ textAlign: "center", padding: "24px 0 12px" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📲</div>
          <div style={{ fontWeight: 800, fontSize: 20, fontFamily: F, marginBottom: 6 }}>Invite ready!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", fontFamily: F }}>Once they join from your link, they're in your crew automatically.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, fontFamily: F }}>Invite via Text</div>
              <div style={{ fontSize: 12, color: "rgba(6,182,212,.75)", fontFamily: F, marginTop: 2 }}>They join from your link and land in your crew 📲</div>
            </div>
            <CloseBtn onClick={onClose} />
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name (optional)" style={{ ...inputStyle, marginBottom: 10 }} />
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} placeholder="Cell phone number" style={{ ...inputStyle, fontWeight: 700, marginBottom: 14, borderColor: digits.length >= 10 ? "rgba(6,182,212,.4)" : "rgba(255,255,255,.08)" }} />
          <div style={{ background: "#13151C", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <Label style={{ marginBottom: 6 }}>MESSAGE PREVIEW</Label>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", fontFamily: F, lineHeight: 1.5, fontStyle: "italic" }}>"{msg}"</div>
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(link); setSent(true); setTimeout(onClose, 1500); }} style={{ background: "none", border: "none", color: "rgba(6,182,212,.8)", fontFamily: F, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>or copy invite link</button>
          <BigButton onClick={send} disabled={digits.length < 10} bg="linear-gradient(135deg,#06B6D4,#0891B2)" color="#fff">
            {digits.length >= 10 ? "📲 Send Invite Text" : "Enter a phone number"}
          </BigButton>
        </>
      )}
    </Sheet>
  );
}

/* ─── Bet Slip ───────────────────────────────────────────────────── */
export function BetSlip({ game, me, contacts, friendIds, available, onSend, onClose, prefill, onDeposit }) {
  const [oppId, setOppId] = useState(prefill?.oppId || null);
  const [fieldSel, setField] = useState(false);
  const [side, setSide] = useState(prefill?.side || null);
  const [amt, setAmt] = useState(prefill?.amt || "");
  const [msg, setMsg] = useState("");
  const [showInvite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);

  const wager = Number(amt);
  const open = game.status === "upcoming" && new Date(game.date) > new Date() && game.spread != null;
  const canSend = open && (oppId || fieldSel) && side && wager > 0 && wager <= available && !busy;
  const yourPick = side && sideLabel(game, side);
  const theirPick = side && sideLabel(game, other(side));

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    const ok = await onSend({ game, side, amount: wager, message: msg.trim(), to: fieldSel ? null : oppId });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      {showInvite && <InviteModal onClose={() => setInvite(false)} me={me} senderName={contacts[me]?.name || "Someone"} game={game} />}
      <Sheet onClose={onClose} z={400}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.5px", color: SPORT_COLOR[game.sport] || "#fff", background: `${SPORT_COLOR[game.sport] || "#fff"}14`, padding: "3px 8px", borderRadius: 6, fontFamily: F }}>{game.sport}</span>
            <div style={{ fontWeight: 800, fontSize: 18, fontFamily: F, lineHeight: 1.2, marginTop: 6 }}>{shortName(game.away)} <span style={{ color: "rgba(255,255,255,.25)", fontWeight: 400, fontSize: 14 }}>at</span> {shortName(game.home)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontFamily: F, marginTop: 2 }}>{new Date(game.date).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {!open ? (
          <div style={{ padding: "18px", background: "rgba(242,95,92,.08)", border: "1px solid rgba(242,95,92,.25)", borderRadius: 14, fontFamily: F, fontSize: 13, color: "#F25F5C", textAlign: "center" }}>
            {game.spread == null ? "No line posted for this game yet — check back soon." : "Betting is closed — this game has started."}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: fieldSel ? 10 : 18 }}>
              {friendIds.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", fontFamily: F, marginBottom: 10 }}>Your crew is empty — invite someone to bet with.</div>}
              <ContactPicker contacts={contacts} friendIds={friendIds} selected={oppId} onSelect={(id) => { setOppId(id); setField(false); }} onInvite={() => setInvite(true)} fieldSelected={fieldSel} onSelectField={() => { setField(true); setOppId(null); }} />
            </div>

            {fieldSel && (
              <div style={{ padding: "11px 14px", background: "linear-gradient(135deg,rgba(168,85,247,.12),rgba(168,85,247,.06))", border: "1px solid rgba(168,85,247,.25)", borderRadius: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🎲</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#A855F7", fontFamily: F }}>The Field — open to your whole crew</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontFamily: F, marginTop: 1 }}>First buddy to take the other side locks it in. Refunded if nobody bites before kickoff.</div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <Label>YOUR PICK</Label>
              <div style={{ display: "flex", gap: 8 }}>
                {["fav", "dog"].map((val) => (
                  <button key={val} onClick={() => setSide(val)} style={{ flex: 1, padding: "14px 10px", background: side === val ? "rgba(232,168,56,.10)" : "rgba(255,255,255,.03)", border: side === val ? "2px solid #E8A838" : "2px solid rgba(255,255,255,.06)", borderRadius: 14, cursor: "pointer", textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: side === val ? "#D4A843" : "rgba(255,255,255,.6)", fontFamily: F }}>{sideLabel(game, val)}</div>
                    <div style={{ fontSize: 10, color: side === val ? "rgba(232,168,56,.6)" : "rgba(255,255,255,.25)", fontFamily: F, marginTop: 2 }}>{game.spread === 0 ? "Pick'em" : val === "fav" ? "Favorite" : "Underdog"}</div>
                  </button>
                ))}
              </div>
            </div>

            {side && (oppId || fieldSel) && (
              <div style={{ background: "#13151C", borderRadius: 14, padding: "11px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontWeight: 700, letterSpacing: "1px", fontFamily: F, marginBottom: 3 }}>YOU</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#3DD68C", fontFamily: F }}>{yourPick}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.15)" }}>VS</div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontWeight: 700, letterSpacing: "1px", fontFamily: F, marginBottom: 3 }}>{fieldSel ? "THE FIELD" : contacts[oppId]?.name?.toUpperCase()}</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#F25F5C", fontFamily: F }}>{theirPick}</div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Label style={{ marginBottom: 0 }}>WAGER</Label>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", fontFamily: F }}>Avail: <span style={{ color: "#D4A843", fontWeight: 700 }}>${available}</span></div>
              </div>
              <AmountPicker amt={amt} setAmt={setAmt} max={available} invalidMsg={<>Not enough BuddyBucks. <u style={{ cursor: "pointer" }} onClick={onDeposit}>Add funds</u></>} />
              {wager > 0 && wager <= available && <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontFamily: F, marginTop: 6 }}>Win and you collect <b style={{ color: "#3DD68C" }}>${wager * 2}</b> (your ${wager} back + ${wager} from them). Push = refund.</div>}
            </div>

            <div style={{ marginBottom: 20 }}>
              <Label>TRASH TALK <span style={{ opacity: 0.5, fontWeight: 400 }}>optional</span></Label>
              <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Say something..." maxLength={140} style={{ ...inputStyle, background: "#13151C", fontSize: 15, fontWeight: 500 }} />
            </div>

            <BigButton onClick={send} disabled={!canSend}>
              {busy ? "Sending…" : !canSend ? "Pick opponent, side & amount" : fieldSel ? `🎲 Post to The Field — $${amt}` : `🎯 Challenge ${contacts[oppId]?.name?.split(" ")[0]} — $${amt}`}
            </BigButton>
          </>
        )}
      </Sheet>
    </>
  );
}

/* ─── Team pill row used by inbox cards ──────────────────────────── */
function MatchupRow({ game, leftAvatar, rightAvatar }) {
  const sc = SPORT_COLOR[game.sport] || "#D4A843";
  const awayT = getTeam(game.away), homeT = getTeam(game.home);
  const pill = (team, t, avatar, right) => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: `${t.color}14`, borderRadius: 8, border: `1px solid ${t.color}26`, justifyContent: right ? "flex-end" : "flex-start", flexDirection: right ? "row-reverse" : "row" }}>
      <div style={{ position: "relative", flexShrink: 0, width: 54, height: 36 }}>
        <div style={{ position: "absolute", [right ? "right" : "left"]: 0, top: 0 }}><TeamLogo teamName={team} size={36} /></div>
        <div style={{ position: "absolute", [right ? "right" : "left"]: 22, top: 4, borderRadius: "50%", border: "2px solid #13151C" }}>{avatar}</div>
      </div>
      <div style={{ minWidth: 0, textAlign: right ? "right" : "left" }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.4)", fontFamily: F, lineHeight: 1, marginBottom: 2 }}>{shortName(team)}</div>
        <div style={{ fontSize: 13, fontWeight: 900, color: team === game.favTeam ? sc : "rgba(255,255,255,.5)", fontFamily: F, lineHeight: 1 }}>{teamLine(game, team)}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {pill(game.away, awayT, leftAvatar, false)}
      <span style={{ fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,.15)", fontFamily: F, flexShrink: 0 }}>VS</span>
      {pill(game.home, homeT, rightAvatar, true)}
    </div>
  );
}

/* ─── Inbox Card ─────────────────────────────────────────────────── */
export function InboxCard({ w, me, contacts, onAccept, onDeny, onCounter, onCancel, onSendToField }) {
  const [counterAmt, setCounterAmt] = useState("");
  const [showCounter, setShowCounter] = useState(false);
  const [busy, setBusy] = useState(false);
  const received = w.from !== me;
  const isField = w.toField;
  const from = contacts[w.from] || { name: "Someone", color: "#666", initials: "?" };
  const to = contacts[w.to];
  const run = (fn) => async (...a) => { if (busy) return; setBusy(true); await fn(...a); setBusy(false); };

  const mins = w.game?.date ? Math.max(0, Math.round((new Date(w.game.date) - new Date()) / 60000)) : null;
  const timeLabel = mins === null ? null : mins < 60 ? `${mins}m to kickoff` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d`;
  const urgent = mins !== null && mins < 30;
  const sc = SPORT_COLOR[w.game?.sport] || "#D4A843";
  // Who holds each team in this challenge
  const fromTeam = teamForSide(w.game, w.side);
  const avatarFor = (team) => {
    const holder = team === fromTeam ? w.from : received ? me : isField ? null : w.to;
    if (!holder) return <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(168,85,247,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎲</div>;
    return <Avatar contact={contacts[holder]} size={28} showRing={holder === me} />;
  };
  const title = received ? (isField ? `${from.name} posted an open bet` : `New Challenge from ${from.name}`) : isField ? "Posted to The Field" : `Challenge sent to ${to?.name || "?"}`;

  return (
    <div style={{ background: "#13151C", border: `1.5px solid ${received ? (isField ? "rgba(168,85,247,.28)" : "rgba(232,168,56,.25)") : "rgba(255,255,255,.07)"}`, borderRadius: 16, padding: "11px 13px", marginBottom: 8, position: "relative", overflow: "hidden", opacity: busy ? 0.6 : 1 }}>
      {received && <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: isField ? "#A855F7" : "linear-gradient(180deg,#E8A838,#F97316)" }} />}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8, paddingLeft: received ? 4 : 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#F0EDE8", fontFamily: F, lineHeight: 1.2, marginBottom: 3 }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: sc, letterSpacing: "0.8px", fontFamily: F, background: `${sc}18`, padding: "1px 5px", borderRadius: 4 }}>{w.game?.sport}</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: F }}>{shortName(w.game?.away)} @ {shortName(w.game?.home)}</span>
            {timeLabel && <span style={{ fontSize: 9, fontWeight: 700, color: urgent ? "#F25F5C" : "rgba(255,255,255,.3)", fontFamily: F }}>· {timeLabel}</span>}
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#F97316", fontFamily: F, lineHeight: 1, flexShrink: 0 }}>${w.amount}</div>
      </div>

      <div style={{ marginBottom: w.message ? 8 : 10 }}>
        <MatchupRow game={w.game} leftAvatar={avatarFor(w.game.away)} rightAvatar={avatarFor(w.game.home)} />
      </div>
      {received && <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", fontFamily: F, marginBottom: 8 }}>You'd get <b style={{ color: "#3DD68C" }}>{w.otherSideLabel}</b> · {from.name.split(" ")[0]} has {w.sideLabel}</div>}

      {w.message && (
        <div style={{ padding: "6px 10px", background: "rgba(232,168,56,.05)", borderRadius: "4px 10px 10px 10px", border: "1px solid rgba(232,168,56,.10)", marginBottom: 9 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", fontFamily: F, fontStyle: "italic" }}>"{w.message}"</div>
        </div>
      )}

      {received && isField && (
        <button onClick={run(() => onAccept(w))} style={{ ...actBtn, width: "100%", background: "linear-gradient(135deg,#A855F7,#7C3AED)", color: "#fff" }}>🎲 Take {w.otherSideLabel} — ${w.amount}</button>
      )}
      {received && !isField && !showCounter && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={run(() => onAccept(w))} style={{ ...actBtn, flex: 2, background: GREEN_BTN, color: "#0A0B0F", boxShadow: "0 3px 16px rgba(74,222,128,.25)" }}>✅ Accept</button>
            <button onClick={() => setShowCounter(true)} style={{ ...actBtn, flex: 1, background: "rgba(168,85,247,.08)", border: "1.5px solid rgba(168,85,247,.3)", color: "#A855F7", fontSize: 13 }}>🔄 Counter</button>
          </div>
          <button onClick={run(() => onDeny(w))} style={{ ...actBtn, width: "100%", background: "rgba(239,68,68,.08)", border: "1.5px solid rgba(239,68,68,.35)", color: "#F25F5C", fontSize: 13 }}>✕ Decline</button>
        </div>
      )}
      {received && !isField && showCounter && (
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontFamily: F, marginBottom: 7 }}>Same line, your amount. Their ${w.amount} is refunded and a new challenge goes back to {from.name.split(" ")[0]}.</div>
          <div style={{ display: "flex", gap: 7 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,.25)", fontWeight: 800 }}>$</span>
              <input type="number" inputMode="numeric" value={counterAmt} onChange={(e) => setCounterAmt(e.target.value.replace(/\D/g, ""))} placeholder={String(w.amount)} style={{ ...inputStyle, background: "#13151C", padding: "11px 11px 11px 24px", borderColor: "rgba(168,85,247,.3)", fontSize: 15 }} />
            </div>
            <button onClick={run(async () => { if (counterAmt && (await onCounter(w, Number(counterAmt)))) setShowCounter(false); })} style={{ ...actBtn, padding: "11px 16px", background: "rgba(168,85,247,.15)", border: "1.5px solid #A855F7", color: "#A855F7" }}>Send</button>
            <button onClick={() => setShowCounter(false)} style={{ ...actBtn, padding: "11px 13px", background: "#13151C", border: "1.5px solid rgba(255,255,255,.07)", color: "rgba(255,255,255,.35)" }}>✕</button>
          </div>
        </div>
      )}

      {!received && !isField && to?.phone && (
        <a href={nudgeUrl(to.phone, `Hey ${to.name.split(" ")[0]}, just sent you a $${w.amount} BetBuddy challenge on ${shortName(w.game.away)} @ ${shortName(w.game.home)} 👊 ${location.origin}`)}
          style={{ display: "block", textAlign: "center", padding: "10px", marginBottom: 7, background: "rgba(6,182,212,.08)", border: "1.5px solid rgba(6,182,212,.3)", borderRadius: 11, color: "#22D3EE", fontFamily: F, fontWeight: 800, fontSize: 12, textDecoration: "none" }}>
          💬 Nudge {to.name.split(" ")[0]} by text
        </a>
      )}
      {!received && (
        <div style={{ display: "flex", gap: 7 }}>
          {!isField && <button onClick={run(() => onSendToField(w))} style={{ ...actBtn, flex: 1, background: "linear-gradient(135deg,rgba(74,222,128,.18),rgba(34,197,94,.08))", border: "2px solid rgba(74,222,128,.5)", color: "#4ADE80", fontSize: 12 }}>🎲 Open to Field</button>}
          <button onClick={run(() => onCancel(w))} style={{ ...actBtn, flex: 1, background: "rgba(239,68,68,.08)", border: "2px solid rgba(239,68,68,.4)", color: "#F25F5C", fontSize: 12 }}>↩️ Cancel & Refund</button>
        </div>
      )}
      {isField && !received && <div style={{ fontSize: 11, color: "rgba(168,85,247,.7)", fontFamily: F, textAlign: "center", fontStyle: "italic", marginTop: 7 }}>Waiting for someone in your crew to take it…</div>}
    </div>
  );
}
const actBtn = { padding: "12px", border: "none", borderRadius: 11, cursor: "pointer", fontWeight: 800, fontSize: 14, fontFamily: F };

/* ─── Trash-talk chat ────────────────────────────────────────────── */
export function ChatDrawer({ bet, me, contacts, messages, onClose, onSend }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef();
  const oppId = bet.from === me ? bet.to : bet.from;
  const opp = contacts[oppId];
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  const send = () => { const t = input.trim(); if (!t) return; onSend(bet.id, t); setInput(""); };
  return (
    <Sheet onClose={onClose} z={450} height="75vh" pad="0">
      <div style={{ padding: "8px 16px 12px", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <Avatar contact={opp} size={36} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, fontFamily: F }}>{opp?.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontFamily: F }}>{shortName(bet.game.away)} at {shortName(bet.game.home)} · <span style={{ color: "#D4A843" }}>${bet.amount}</span></div>
          </div>
        </div>
        <div style={{ padding: "4px 10px", background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: F, marginBottom: 1 }}>YOUR PICK</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#3DD68C", fontFamily: F }}>{bet.from === me ? bet.sideLabel : bet.otherSideLabel}</div>
        </div>
        <CloseBtn onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.35 }}>💬</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.3)", fontFamily: F }}>No messages yet</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.2)", marginTop: 4, fontFamily: F }}>Start the trash talk 🗑️</div>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.user_id === me;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", gap: 7 }}>
              {!mine && <Avatar contact={contacts[m.user_id]} size={28} />}
              <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", gap: 2 }}>
                <div style={{ padding: "10px 13px", background: mine ? GOLD_BTN : "rgba(255,255,255,.07)", borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", border: mine ? "none" : "1px solid rgba(255,255,255,.06)" }}>
                  <div style={{ fontSize: 14, color: mine ? "#0A0B0F" : "#fff", fontFamily: F, fontWeight: mine ? 600 : 400, lineHeight: 1.4, wordBreak: "break-word" }}>{m.body}</div>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.25)", fontFamily: F, paddingBottom: 2 }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "10px 14px max(env(safe-area-inset-bottom),20px)", borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Trash talk…" maxLength={300}
          style={{ flex: 1, padding: "11px 14px", background: "rgba(255,255,255,.05)", border: "1.5px solid rgba(255,255,255,.08)", borderRadius: 24, color: "#F0EDE8", fontFamily: F, fontSize: 16, outline: "none" }} />
        <button onClick={send} disabled={!input.trim()} aria-label="Send" style={{ width: 42, height: 42, borderRadius: "50%", background: input.trim() ? GOLD_BTN : "rgba(255,255,255,.05)", border: "none", cursor: input.trim() ? "pointer" : "default", fontSize: 18, flexShrink: 0, color: "#0A0B0F", fontWeight: 900 }}>↑</button>
      </div>
    </Sheet>
  );
}

/* ─── Home: Active Bet Card ──────────────────────────────────────── */
export function ActiveBetCard({ bet, me, contacts, onOpenChat, unreadCount = 0 }) {
  const g = bet.game;
  const oppId = bet.from === me ? bet.to : bet.from;
  const opp = contacts[oppId];
  const mySide = bet.from === me ? bet.side : other(bet.side);
  const myPick = sideLabel(g, mySide), oppPick = sideLabel(g, other(mySide));
  const myTeam = teamForSide(g, mySide), oppTeam = teamForSide(g, other(mySide));
  const isLive = g.status === "live" || (g.status !== "final" && new Date(g.date) <= new Date());
  const isFinal = g.status === "final";
  const hasScore = g.homeScore != null && g.awayScore != null;
  const myScore = myTeam === g.home ? g.homeScore : g.awayScore;
  const oppScore = myTeam === g.home ? g.awayScore : g.homeScore;
  const state = hasScore ? coverState(g, mySide) : null;
  const winning = state === "covering";
  const sc = SPORT_COLOR[g.sport] || "#D4A843";
  const tier = bet.amount >= 100 ? { c1: "#60A5FA", c2: "#2563EB", label: "PLATINUM" } : bet.amount >= 50 ? { c1: "#F0C84A", c2: "#C8902A", label: "GOLD" } : bet.amount >= 25 ? { c1: "#C0C0C0", c2: "#808080", label: "SILVER" } : { c1: "#CD7F32", c2: "#8B4513", label: "BRONZE" };
  const kickoff = new Date(g.date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div style={{ borderRadius: 14, marginBottom: 8, background: "#13151C", padding: "10px 12px", border: `1.5px solid ${isLive ? "rgba(61,214,140,.6)" : "rgba(255,255,255,.07)"}`, position: "relative", overflow: "hidden" }}>
      {winning && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(61,214,140,.08) 0%, transparent 60%)", pointerEvents: "none" }} />}
      <div style={{ marginBottom: 6, position: "relative" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#F0EDE8", fontFamily: F }}>${bet.amount} vs. {opp?.name || "?"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {isFinal ? <span style={{ fontSize: 9, fontWeight: 800, color: "#D4A843", fontFamily: F }}>FINAL · settling…</span>
            : isLive ? <>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3DD68C", animation: "livePulse 1.4s infinite" }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: "#3DD68C", fontFamily: F }}>LIVE</span>
                {state && <span style={{ fontSize: 8, fontWeight: 800, color: winning ? "#3DD68C" : state === "push" ? "#D4A843" : "#F25F5C", background: winning ? "rgba(61,214,140,.15)" : "rgba(255,255,255,.05)", padding: "2px 6px", borderRadius: 5, fontFamily: F }}>{winning ? "COVERING ✓" : state === "push" ? "ON THE NUMBER" : "NOT COVERING"}</span>}
              </>
            : <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(249,115,22,.85)", letterSpacing: "1px", fontFamily: F }}>LOCKED 🔒 · {kickoff}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.2px", color: sc, background: `${sc}18`, padding: "2px 7px", borderRadius: 5, fontFamily: F }}>{g.sport}</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: F }}>{shortName(g.away)} @ {shortName(g.home)}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ position: "relative", flexShrink: 0, width: 54, height: 36 }}>
            <div style={{ position: "absolute", left: 0, top: 0 }}><TeamLogo teamName={myTeam} size={36} /></div>
            <div style={{ position: "absolute", left: 22, top: 4, border: "2px solid #13151C", borderRadius: 10 }}><Avatar contact={contacts[me]} size={28} showRing /></div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#3DD68C", fontFamily: F, marginBottom: 1 }}>You</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#F0EDE8", fontFamily: F, lineHeight: 1.1 }}>{shortName(myTeam)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.45)", fontFamily: F }}>{myPick}</div>
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: "0 8px" }}>
          {hasScore && (isLive || isFinal)
            ? <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: winning ? "#3DD68C" : "#F0EDE8", fontFamily: F, lineHeight: 1 }}>{myScore}</span>
                <span style={{ fontSize: 10, color: "rgba(240,237,232,.2)", fontWeight: 900 }}>–</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: "#F0EDE8", fontFamily: F, lineHeight: 1 }}>{oppScore}</span>
              </div>
            : <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(240,237,232,.15)", letterSpacing: "2px", fontFamily: F }}>VS</span>}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", minWidth: 0 }}>
          <div style={{ minWidth: 0, textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.35)", fontFamily: F, marginBottom: 1 }}>{opp?.name?.split(" ")[0] || "?"}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#F0EDE8", fontFamily: F, lineHeight: 1.1 }}>{shortName(oppTeam)}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(240,237,232,.35)", fontFamily: F }}>{oppPick}</div>
          </div>
          <div style={{ position: "relative", flexShrink: 0, width: 54, height: 36 }}>
            <div style={{ position: "absolute", right: 0, top: 4, border: "2px solid #13151C", borderRadius: 10 }}><Avatar contact={opp} size={28} /></div>
            <div style={{ position: "absolute", right: 22, top: 0 }}><TeamLogo teamName={oppTeam} size={36} /></div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9, paddingTop: 8, borderTop: "1px solid rgba(240,237,232,.05)", position: "relative" }}>
        <button onClick={onOpenChat} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ position: "relative", background: "rgba(240,237,232,.06)", borderRadius: 7, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(240,237,232,.55)"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
            {unreadCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#F25F5C", color: "#fff", borderRadius: 99, fontSize: 8, fontWeight: 900, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount}</span>}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", fontFamily: F }}>Trash Talk</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: `${tier.c2}18`, border: `1px solid ${tier.c2}40`, borderRadius: 20, padding: "4px 10px 4px 6px" }}>
          <div style={{ display: "flex" }}>{[0, 1].map((i) => <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: `radial-gradient(circle at 35% 35%, ${tier.c1}, ${tier.c2})`, border: "1.5px solid rgba(0,0,0,.3)", marginLeft: i ? -4 : 0 }} />)}</div>
          <span style={{ fontSize: 13, fontWeight: 900, color: tier.c1, fontFamily: F }}>${bet.amount}</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: tier.c2, fontFamily: F, letterSpacing: "0.5px" }}>{tier.label}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Completed Bet Row ──────────────────────────────────────────── */
export function CompletedBetRow({ bet, me, contacts }) {
  const opp = contacts[bet.from === me ? bet.to : bet.from];
  const push = bet.status === "settled" && !bet.winner;
  const voided = bet.status === "void";
  const won = bet.winner === me;
  const sc = SPORT_COLOR[bet.game?.sport] || "#D4A843";
  const myPick = bet.from === me ? bet.sideLabel : bet.otherSideLabel;
  const neutral = push || voided;
  const g = bet.game;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#13151C", border: `1px solid ${neutral ? "rgba(255,255,255,.06)" : won ? "rgba(61,214,140,.15)" : "rgba(242,95,92,.1)"}`, borderRadius: 12, marginBottom: 5 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: neutral ? "rgba(255,255,255,.05)" : won ? "rgba(61,214,140,.12)" : "rgba(242,95,92,.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 14 }}>{neutral ? "🤝" : won ? "🏆" : "💸"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
        <TeamLogo teamName={g.away} size={26} />
        <span style={{ fontSize: 8, color: "rgba(240,237,232,.2)", fontWeight: 900 }}>@</span>
        <TeamLogo teamName={g.home} size={26} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#F0EDE8", fontFamily: F, lineHeight: 1.2 }}>{voided ? "Voided" : push ? "Push" : won ? "Won" : "Lost"} vs {opp?.name?.split(" ")[0] || "?"}</div>
        <div style={{ fontSize: 10, color: "rgba(240,237,232,.35)", fontFamily: F, marginTop: 2 }}>
          {myPick} · <span style={{ color: sc }}>{g.sport}</span>
          {g.homeScore != null && ` · ${shortName(g.away)} ${g.awayScore}, ${shortName(g.home)} ${g.homeScore}`}
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: neutral ? "rgba(255,255,255,.4)" : won ? "#3DD68C" : "#F25F5C", fontFamily: F, flexShrink: 0 }}>
        {neutral ? "$0" : won ? `+$${bet.amount}` : `-$${bet.amount}`}
      </div>
    </div>
  );
}

/* ─── Games tab card ─────────────────────────────────────────────── */
export function ShowcaseCard({ game, onTap }) {
  const sc = SPORT_COLOR[game.sport] || "#D4A843";
  const isLive = game.status === "live" || new Date(game.date) <= new Date();
  const d = new Date(game.date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd - today) / 86400000);
  const dayLabel = diff === 0 ? "TODAY" : diff === 1 ? "TOMORROW" : d.toLocaleDateString([], { weekday: "short" }).toUpperCase();
  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const isPrimetime = game.importance >= 3;
  const isHot = game.wagerCount >= 3;
  const noLine = game.spread == null;
  const side = (team, right) => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, flexDirection: right ? "row-reverse" : "row", minWidth: 0 }}>
      <TeamLogo teamName={team} size={36} />
      <div style={{ textAlign: right ? "right" : "left", minWidth: 0 }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,.3)", letterSpacing: "1px", fontFamily: F, marginBottom: 1 }}>{right ? "HOME" : "AWAY"}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#F0EDE8", fontFamily: F, lineHeight: 1.05 }}>{shortName(team)}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: noLine ? "rgba(255,255,255,.25)" : team === game.favTeam ? sc : "rgba(255,255,255,.4)", fontFamily: F, marginTop: 2 }}>
          {isLive && game.homeScore != null ? (right ? game.homeScore : game.awayScore) : noLine ? "—" : teamLine(game, team)}
        </div>
      </div>
    </div>
  );
  return (
    <button onClick={() => onTap(game)} style={{ width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 7, background: "#13151C", borderRadius: 14, border: `1.5px solid ${isLive ? "rgba(61,214,140,.3)" : isPrimetime ? "rgba(212,168,67,.22)" : "rgba(255,255,255,.05)"}`, padding: "12px 14px", display: "block", opacity: isLive ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isLive
            ? <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(61,214,140,.12)", borderRadius: 8, padding: "3px 8px" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3DD68C", animation: "livePulse 1.4s infinite" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: "#3DD68C", letterSpacing: "1px", fontFamily: F }}>LIVE · CLOSED</span>
              </div>
            : <>
                <span style={{ fontSize: 9, fontWeight: 700, color: sc, letterSpacing: "1.5px", fontFamily: F, background: `${sc}14`, padding: "3px 8px", borderRadius: 7 }}>{game.sport}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: "1px", fontFamily: F }}>{dayLabel}</span>
                <span style={{ fontSize: 9, color: "rgba(240,237,232,.3)", fontFamily: F }}>{timeStr}</span>
              </>}
          {isPrimetime && !isLive && <span style={{ fontSize: 8, fontWeight: 800, color: "#D4A843", background: "rgba(212,168,67,.15)", border: "1px solid rgba(212,168,67,.3)", padding: "2px 7px", borderRadius: 6, fontFamily: F }}>🔥 PRIMETIME</span>}
          {isHot && !isPrimetime && <span style={{ fontSize: 8, fontWeight: 800, color: "#A855F7", background: "rgba(168,85,247,.12)", padding: "2px 7px", borderRadius: 6, fontFamily: F }}>📈 HOT</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {game.wagerCount > 0 && <><span style={{ fontSize: 11, fontWeight: 700, color: "rgba(240,237,232,.4)", fontFamily: F }}>{game.wagerCount}</span><span style={{ fontSize: 8, color: "rgba(240,237,232,.25)", fontFamily: F }}>bets</span></>}
          <span style={{ color: "rgba(240,237,232,.25)", fontSize: 16, lineHeight: 1 }}>›</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {side(game.away, false)}
        <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.15)", fontFamily: F }}>@</span>
        {side(game.home, true)}
      </div>
    </button>
  );
}

/* ─── DashBar ────────────────────────────────────────────────────── */
export function DashBar({ activeBets, pendingOut, pendingIn, onTabClick }) {
  const started = (b) => b.game.status !== "upcoming" || new Date(b.game.date) <= new Date();
  const inPlay = activeBets.filter(started).length;
  const locked = activeBets.length - inPlay;
  const pendingTotal = pendingOut + pendingIn;
  const stats = [
    { label: "IN PLAY", value: inPlay, color: "#3DD68C", dot: true },
    { label: "LOCKED", value: locked, color: "#F97316" },
    { label: "PENDING", value: pendingTotal, color: "#A855F7", dot: pendingIn > 0, onClick: pendingTotal > 0 ? onTabClick : null, badge: pendingIn > 0 ? pendingIn : null },
  ];
  return (
    <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
      {stats.map((s) => (
        <div key={s.label} onClick={s.onClick || undefined} style={{ flex: 1, background: "#13151C", borderRadius: 12, padding: "9px 11px", border: `1px solid ${s.value > 0 ? s.color + "30" : "rgba(255,255,255,.05)"}`, display: "flex", flexDirection: "column", gap: 2, cursor: s.onClick ? "pointer" : "default", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {s.dot && s.value > 0 && <div style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, animation: "livePulse 1.4s infinite" }} />}
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "1.5px", color: "rgba(255,255,255,.3)", fontFamily: F }}>{s.label}</span>
            {s.badge && <span style={{ marginLeft: "auto", fontSize: 8, fontWeight: 900, color: s.color, background: `${s.color}18`, borderRadius: 99, padding: "1px 5px", fontFamily: F }}>{s.badge} in</span>}
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: s.value > 0 ? s.color : "rgba(255,255,255,.15)", fontFamily: F, lineHeight: 1 }}>{s.value}</div>
          {s.onClick && s.value > 0 && <div style={{ fontSize: 8, color: `${s.color}90`, fontFamily: F }}>tap to review →</div>}
        </div>
      ))}
    </div>
  );
}

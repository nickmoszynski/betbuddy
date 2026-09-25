import { useRef } from "react";
import { getTeam } from "../lib/teams.js";
import { timeAgo } from "../lib/util.js";

export const F = "'DM Sans',sans-serif";
export const GOLD_BTN = "linear-gradient(135deg,#E8A838,#C97E1A)";
export const GREEN_BTN = "linear-gradient(135deg,#4ADE80,#22C55E)";

export const NOTIF = {
  BET_RECEIVED:   { icon: "🎯", color: "#D4A843" },
  BET_ACCEPTED:   { icon: "✅", color: "#3DD68C" },
  BET_DECLINED:   { icon: "👎", color: "#F25F5C" },
  BET_COUNTER:    { icon: "🔄", color: "#A855F7" },
  BET_LOCKED:     { icon: "🔒", color: "#F97316" },
  BET_SETTLED_W:  { icon: "🏆", color: "#3DD68C" },
  BET_SETTLED_L:  { icon: "💸", color: "#F25F5C" },
  AUTO_SETTLE:    { icon: "⚡", color: "#3DD68C" },
  DEPOSIT:        { icon: "💰", color: "#3B82F6" },
  BUDDY_UP:       { icon: "👊", color: "#06B6D4" },
  LOW_BALANCE:    { icon: "⚠️", color: "#D4A843" },
  FIELD_MATCHED:  { icon: "🎲", color: "#A855F7" },
  FIELD_LOCKED:   { icon: "🎲", color: "#A855F7" },
  WAGER_CANCELLED:{ icon: "↩️", color: "#6B7280" },
  SMS_INVITE:     { icon: "📲", color: "#06B6D4" },
  CHAT_MSG:       { icon: "💬", color: "#D4A843" },
  ERROR:          { icon: "⚠️", color: "#F25F5C" },
};

export function Avatar({ contact, size = 38, showRing = false, onUpload = null }) {
  const c = contact || { name: "?", color: "#555", initials: "?" };
  const s = size, fs = Math.round(s * 0.36);
  const inputRef = useRef();
  const hasPhoto = c.photo && (c.photo.startsWith("http") || c.photo.startsWith("data:"));
  return (
    <div style={{ position: "relative", flexShrink: 0, width: s, height: s, cursor: onUpload ? "pointer" : undefined }} onClick={onUpload ? () => inputRef.current?.click() : undefined}>
      {hasPhoto ? (
        <img src={c.photo} alt={c.name} style={{ width: s, height: s, borderRadius: s * 0.28, objectFit: "cover", border: showRing ? `2px solid ${c.color}` : `1.5px solid ${c.color}40`, boxShadow: showRing ? `0 0 0 3px ${c.color}22` : "none", display: "block", background: c.color + "33" }} />
      ) : (
        <div style={{ width: s, height: s, borderRadius: s * 0.28, background: `linear-gradient(135deg,${c.color}cc,${c.color}66)`, border: showRing ? `2px solid ${c.color}` : `1.5px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs, fontWeight: 900, color: "#F0EDE8", fontFamily: F, boxShadow: showRing ? `0 0 0 3px ${c.color}22` : "none", letterSpacing: "-0.5px" }}>
          {c.initials}
        </div>
      )}
      {onUpload && (
        <>
          <div className="avatar-overlay" style={{ position: "absolute", inset: 0, borderRadius: s * 0.28, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .2s" }}>
            <span style={{ fontSize: s * 0.3 }}>📷</span>
          </div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </>
      )}
    </div>
  );
}

export function TeamLogo({ teamName = "", size = 52 }) {
  const t = getTeam(teamName);
  const r = size * 0.28;
  const fs = size <= 30 ? size * 0.34 : size <= 44 ? size * 0.27 : size * 0.22;
  return (
    <div style={{ width: size, height: size, borderRadius: r, flexShrink: 0, background: `linear-gradient(145deg,${t.color}ee,${t.color}aa)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", boxShadow: `0 4px 20px ${t.color}40` }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(255,255,255,.12) 0%,transparent 60%)", pointerEvents: "none" }} />
      <span style={{ fontFamily: F, fontWeight: 900, fontSize: t.abbr.length > 3 ? fs * 0.85 : fs, color: t.alt, letterSpacing: t.abbr.length > 3 ? "-1px" : "-0.5px", lineHeight: 1, position: "relative", zIndex: 1, textShadow: "0 1px 6px rgba(0,0,0,.5)", userSelect: "none" }}>{t.abbr}</span>
    </div>
  );
}

export function Toasts({ toasts }) {
  return (
    <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 10px)", left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", flexDirection: "column", gap: 6, width: "calc(100% - 28px)", maxWidth: 450, pointerEvents: "none" }}>
      {toasts.map((t) => {
        const n = NOTIF[t.type] || NOTIF.BET_RECEIVED;
        return (
          <div key={t.id} style={{ background: "rgba(6,10,20,0.97)", border: `1px solid ${n.color}30`, borderLeft: `3px solid ${n.color}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, animation: "toastIn .3s cubic-bezier(.34,1.56,.64,1)", backdropFilter: "blur(24px)", boxShadow: "0 4px 30px rgba(0,0,0,.6)" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#F0EDE8", fontFamily: F }}>{t.msg}</div>
              {t.sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,.62)", fontFamily: F }}>{t.sub}</div>}
            </div>
            {t.amt ? <div style={{ fontSize: 15, fontWeight: 800, color: n.color, flexShrink: 0, fontFamily: F }}>${t.amt}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// Bottom sheet used by every modal
export function Sheet({ onClose, children, z = 500, height, maxHeight = "92vh", border = "rgba(255,255,255,.06)", pad = "14px 20px 36px" }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", zIndex: z, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111318", borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 480, height, maxHeight, overflowY: "auto", border: `1px solid ${border}`, animation: "slideUp .3s cubic-bezier(.34,1.56,.64,1)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0", flexShrink: 0 }}><div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.12)" }} /></div>
        <div style={{ padding: pad, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

export function SheetHeader({ title, sub, onClose, subColor = "rgba(255,255,255,.35)" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, fontFamily: F }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: subColor, fontFamily: F, marginTop: 2 }}>{sub}</div>}
      </div>
      <CloseBtn onClick={onClose} />
    </div>
  );
}

export const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} aria-label="Close" style={{ background: "rgba(255,255,255,.06)", border: "none", borderRadius: 9, width: 32, height: 32, cursor: "pointer", color: "rgba(255,255,255,.67)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
);

export const Label = ({ children, style }) => (
  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.57)", letterSpacing: "1.2px", marginBottom: 8, fontFamily: F, ...style }}>{children}</div>
);

export const inputStyle = { width: "100%", padding: "14px", background: "#20242F", border: "1.5px solid rgba(232,168,56,.35)", borderRadius: 12, color: "#F0EDE8", fontSize: 16, fontWeight: 600, fontFamily: F, outline: "none" };

export function BigButton({ children, onClick, disabled, bg = GOLD_BTN, color = "#0A0B0F", style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "17px", background: disabled ? "rgba(232,168,56,.14)" : bg, border: disabled ? "1.5px solid rgba(232,168,56,.3)" : "none", borderRadius: 15, cursor: disabled ? "default" : "pointer", color: disabled ? "rgba(240,200,120,.75)" : color, fontFamily: F, fontWeight: 800, fontSize: 16, boxShadow: disabled ? "none" : "0 4px 24px rgba(232,168,56,.2)", ...style }}>
      {children}
    </button>
  );
}

export function AmountPicker({ amt, setAmt, quick = [10, 25, 50, 100], max, invalidMsg }) {
  const n = Number(amt);
  const over = max != null && amt && n > max;
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {quick.map((v) => (
          <button key={v} onClick={() => setAmt(String(v))} style={{ flex: 1, padding: "12px 0", background: amt === String(v) ? "rgba(232,168,56,.12)" : "rgba(255,255,255,.03)", border: amt === String(v) ? "1.5px solid #E8A838" : "1.5px solid rgba(255,255,255,.06)", borderRadius: 11, cursor: "pointer", color: amt === String(v) ? "#D4A843" : "rgba(255,255,255,.4)", fontWeight: 800, fontSize: 14, fontFamily: F }}>${v}</button>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,.47)", fontWeight: 800, fontSize: 17 }}>$</span>
        <input type="number" inputMode="numeric" min="1" step="1" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} placeholder="Custom amount"
          style={{ ...inputStyle, background: "#13151C", padding: "14px 14px 14px 30px", fontWeight: 700, borderColor: over ? "rgba(239,68,68,.6)" : "rgba(232,168,56,.35)" }} />
      </div>
      {over && <div style={{ fontSize: 12, color: "#F25F5C", fontFamily: F, marginTop: 6 }}>⚠️ {invalidMsg || `You have $${max} available.`}</div>}
    </div>
  );
}

export function ActivityDrawer({ notifs, contacts, onClose, onClear }) {
  return (
    <Sheet onClose={onClose} maxHeight="78vh" pad="6px 0 0">
      <div style={{ padding: "4px 18px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ fontWeight: 800, fontSize: 17, fontFamily: F }}>Activity</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {notifs.length > 0 && <button onClick={onClear} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.57)", fontFamily: F, fontSize: 12, fontWeight: 600 }}>Clear all</button>}
          <CloseBtn onClick={onClose} />
        </div>
      </div>
      <div style={{ overflowY: "auto", padding: "8px 16px 28px" }}>
        {notifs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,.42)", fontFamily: F }}>No activity yet</div>
        ) : notifs.map((n) => {
          const nt = NOTIF[n.type] || NOTIF.BET_RECEIVED;
          const actor = n.actor_id ? contacts[n.actor_id] : null;
          return (
            <div key={n.id} style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,.03)", opacity: n.read ? 0.6 : 1 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                {actor ? <Avatar contact={actor} size={36} /> : <div style={{ width: 36, height: 36, borderRadius: 10, background: `${nt.color}18`, border: `1px solid ${nt.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{nt.icon}</div>}
                {actor && <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 5, background: "#111318", border: `1px solid ${nt.color}60`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}>{nt.icon}</div>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F0EDE8", fontFamily: F, lineHeight: 1.3 }}>{n.msg}</div>
                {n.sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,.57)", fontFamily: F, marginTop: 1 }}>{n.sub}</div>}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.44)", fontFamily: F, marginTop: 2 }}>{timeAgo(n.created_at)}</div>
              </div>
              {!n.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: nt.color, flexShrink: 0, marginTop: 5 }} />}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

export function Empty({ big, title, sub, cta, onCta }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 46, marginBottom: 14, color: "rgba(212,168,67,.2)", fontFamily: F, fontWeight: 900, lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,.52)", fontFamily: F }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,.42)", marginTop: 4, fontFamily: F }}>{sub}</div>}
      {cta && <button onClick={onCta} style={{ marginTop: 18, padding: "12px 28px", background: GOLD_BTN, border: "none", borderRadius: 13, cursor: "pointer", color: "#0A0B0F", fontWeight: 800, fontSize: 14, fontFamily: F }}>{cta}</button>}
    </div>
  );
}

export const SectionLabel = ({ children, color = "rgba(240,237,232,.3)", style }) => (
  <div style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: "2px", marginBottom: 10, fontFamily: F, ...style }}>{children}</div>
);

// Prompt to turn on lock-screen alerts (or, on iPhone Safari, to install first)
export function PushCard({ state, onEnable, onDismiss }) {
  if (!state || state === "on" || state === "unsupported") return null;
  const wrap = { padding: "14px 16px", borderRadius: 14, marginBottom: 12, fontFamily: F, position: "relative" };
  const later = onDismiss && <button onClick={onDismiss} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "rgba(255,255,255,.57)", fontSize: 12, cursor: "pointer", fontFamily: F }}>Later</button>;
  if (state === "ios-install") {
    return (
      <div style={{ ...wrap, background: "linear-gradient(135deg,rgba(59,130,246,.14),rgba(59,130,246,.04))", border: "1px solid rgba(59,130,246,.35)" }}>
        {later}
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>📲 Get alerts on your iPhone</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.55 }}>
          1. Tap the <b>Share</b> button <span style={{ fontSize: 15 }}>⬆️</span> at the bottom of Safari<br />
          2. Scroll down and tap <b>Add to Home Screen</b><br />
          3. Open BetBuddy from the new icon and tap <b>Turn on alerts</b>
        </div>
      </div>
    );
  }
  if (state === "blocked") {
    return (
      <div style={{ ...wrap, background: "rgba(242,95,92,.07)", border: "1px solid rgba(242,95,92,.3)" }}>
        {later}
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>🔕 Alerts are blocked</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>Turn them on in your phone's Settings → Notifications → BetBuddy, then come back.</div>
      </div>
    );
  }
  return (
    <div style={{ ...wrap, background: "linear-gradient(135deg,rgba(232,168,56,.14),rgba(232,168,56,.04))", border: "1px solid rgba(232,168,56,.4)", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>🔔 Turn on alerts</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 2 }}>Get a buzz the second someone challenges you — or pays up.</div>
      </div>
      <button onClick={onEnable} style={{ padding: "11px 16px", background: GOLD_BTN, border: "none", borderRadius: 11, fontWeight: 800, fontSize: 13, color: "#0A0B0F", cursor: "pointer", fontFamily: F, flexShrink: 0 }}>Turn on</button>
    </div>
  );
}

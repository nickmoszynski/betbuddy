import { useState } from "react";
import { F, GOLD_BTN, Avatar, Label, inputStyle, BigButton } from "./ui.jsx";
import { COLORS } from "./crew.jsx";
import { supabase } from "../lib/supabase.js";
import { fmtPhone, initials } from "../lib/util.js";

export function Wordmark({ big }) {
  const s = big ? 1.6 : 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 * s }}>
      <div style={{ width: 36 * s, height: 36 * s, borderRadius: 11 * s, background: GOLD_BTN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 * s, boxShadow: "0 4px 14px rgba(232,168,56,.35)", flexShrink: 0 }}>🤝</div>
      <div>
        <div style={{ fontSize: 19 * s, fontWeight: 900, color: "#F0EDE8", letterSpacing: "-0.8px", lineHeight: 1, fontFamily: F }}>
          Bet<span style={{ background: "linear-gradient(90deg,#E8A838,#F59E0B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Buddy</span>
        </div>
        <div style={{ fontSize: 7.5 * s, color: "rgba(255,255,255,.3)", letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: F, marginTop: 2 }}>Friendly Wagers</div>
      </div>
    </div>
  );
}

const Shell = ({ children }) => (
  <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 22px", maxWidth: 420, margin: "0 auto" }}>{children}</div>
);

export function Login({ invited }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const digits = phone.replace(/\D/g, "").slice(-10);
  const e164 = `+1${digits}`;

  const sendCode = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) setErr(error.message); else setStep("code");
  };
  const verify = async (c = code) => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: c, type: "sms" });
    setBusy(false);
    if (error) setErr(error.message.includes("expired") || error.message.includes("invalid") ? "That code didn't work. Check it or send a new one." : error.message);
  };

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 34 }}><Wordmark big /></div>
      {invited && <div style={{ textAlign: "center", fontFamily: F, fontSize: 14, color: "#D4A843", marginBottom: 18, fontWeight: 700 }}>👊 You've been invited to join a crew</div>}
      <div style={{ fontFamily: F, fontSize: 24, fontWeight: 900, marginBottom: 6, letterSpacing: "-0.5px" }}>{step === "phone" ? "Bet your buddies." : "Enter your code"}</div>
      <div style={{ fontFamily: F, fontSize: 14, color: "rgba(255,255,255,.5)", marginBottom: 24 }}>
        {step === "phone" ? "No house. No vig. Just you vs. your friends. Sign in with your cell — no password needed." : <>We texted a 6-digit code to {fmtPhone(digits)}.</>}
      </div>
      {step === "phone" ? (
        <>
          <Label>CELL PHONE</Label>
          <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} onKeyDown={(e) => e.key === "Enter" && digits.length === 10 && sendCode()} placeholder="(413) 555-0100" style={{ ...inputStyle, fontSize: 20, fontWeight: 800, padding: "16px", marginBottom: 16 }} />
          <BigButton onClick={sendCode} disabled={digits.length !== 10 || busy}>{busy ? "Sending…" : "Text me a code"}</BigButton>
        </>
      ) : (
        <>
          <input inputMode="numeric" autoComplete="one-time-code" value={code} autoFocus
            onChange={(e) => { const c = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(c); if (c.length === 6) verify(c); }}
            placeholder="••••••" style={{ ...inputStyle, fontSize: 30, fontWeight: 900, letterSpacing: "10px", textAlign: "center", padding: "16px", marginBottom: 16 }} />
          <BigButton onClick={() => verify()} disabled={code.length !== 6 || busy}>{busy ? "Checking…" : "Sign in"}</BigButton>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button onClick={() => { setStep("phone"); setCode(""); setErr(""); }} style={linkBtn}>← Different number</button>
            <button onClick={sendCode} disabled={busy} style={linkBtn}>Resend code</button>
          </div>
        </>
      )}
      {err && <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(242,95,92,.1)", border: "1px solid rgba(242,95,92,.3)", borderRadius: 10, color: "#F25F5C", fontFamily: F, fontSize: 13 }}>{err}</div>}
      <div style={{ marginTop: 30, fontSize: 11, color: "rgba(255,255,255,.25)", fontFamily: F, textAlign: "center", lineHeight: 1.5 }}>Private, invite-only app for friends & family. Must be 21+.</div>
    </Shell>
  );
}
const linkBtn = { background: "none", border: "none", color: "rgba(255,255,255,.45)", fontFamily: F, fontSize: 13, cursor: "pointer" };

export function Onboarding({ profile, onSave }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [venmo, setVenmo] = useState("");
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
        <Avatar contact={{ name, color, initials: initials(name) }} size={76} showRing />
      </div>
      <div style={{ fontFamily: F, fontSize: 24, fontWeight: 900, marginBottom: 4, textAlign: "center" }}>Welcome to BetBuddy</div>
      <div style={{ fontFamily: F, fontSize: 14, color: "rgba(255,255,255,.5)", marginBottom: 24, textAlign: "center" }}>What should your buddies call you?</div>
      <Label>YOUR NAME</Label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Uncle Rich" maxLength={30} style={{ ...inputStyle, marginBottom: 14 }} autoFocus />
      <Label>PICK A COLOR</Label>
      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={c} style={{ width: 38, height: 38, borderRadius: 10, background: `${c}30`, border: color === c ? `2.5px solid ${c}` : "2.5px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 16, height: 16, borderRadius: 5, background: c }} /></button>)}
      </div>
      <Label>VENMO <span style={{ opacity: 0.6, fontWeight: 400 }}>optional — for cash outs</span></Label>
      <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@your-venmo" autoCapitalize="off" style={{ ...inputStyle, marginBottom: 16 }} />
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontFamily: F, fontSize: 13, color: "rgba(255,255,255,.7)", marginBottom: 20, cursor: "pointer" }}>
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} style={{ width: 20, height: 20, accentColor: "#D4A843" }} />
        I'm 21 or older
      </label>
      <BigButton disabled={!name.trim() || !age || busy} onClick={async () => { setBusy(true); await onSave({ name: name.trim(), color, venmo: venmo.trim().replace(/^@/, "") || null }); setBusy(false); }}>{busy ? "Saving…" : "Let's go →"}</BigButton>
    </Shell>
  );
}

import { useState } from "react";
import { F, GOLD_BTN, Avatar, Sheet, SheetHeader, Label, inputStyle, BigButton } from "./ui.jsx";
import { InviteModal, inviteLink } from "./bets.jsx";
import { fmtPhone } from "../lib/util.js";

export const COLORS = ["#D4A843", "#3B82F6", "#A855F7", "#F25F5C", "#10B981", "#F97316", "#06B6D4", "#EC4899"];

export function CrewSheet({ me, contacts, friendIds, onClose, onAddByPhone, toast }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [invite, setInvite] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const link = inviteLink(me);

  const add = async () => {
    setBusy(true); setNotFound(false);
    const res = await onAddByPhone(digits);
    setBusy(false);
    if (res === null) setNotFound(true);
    else if (res) setPhone("");
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "BetBuddy", text: `${contacts[me]?.name} wants to bet with you on BetBuddy`, url: link }); } catch { /* cancelled */ } }
    else { await navigator.clipboard?.writeText(link); toast("BUDDY_UP", "Invite link copied", "Paste it in a text to your buddy"); }
  };

  return (
    <>
      {invite && <InviteModal onClose={() => setInvite(false)} me={me} senderName={contacts[me]?.name || "Someone"} />}
      <Sheet onClose={onClose} z={600}>
        <SheetHeader title="My Crew" sub={`${friendIds.length} ${friendIds.length === 1 ? "buddy" : "buddies"} you can bet with`} onClose={onClose} />
        <button onClick={share} style={{ width: "100%", padding: 15, background: GOLD_BTN, border: "none", borderRadius: 14, fontFamily: F, fontWeight: 800, fontSize: 15, color: "#0A0B0F", cursor: "pointer", marginBottom: 8 }}>📲 Share my invite link</button>
        <button onClick={() => setInvite(true)} style={{ width: "100%", padding: 13, background: "rgba(6,182,212,.08)", border: "1.5px solid rgba(6,182,212,.3)", borderRadius: 14, fontFamily: F, fontWeight: 700, fontSize: 14, color: "#22D3EE", cursor: "pointer", marginBottom: 18 }}>Text an invite to a number</button>

        <Label>ALREADY ON BETBUDDY? ADD BY PHONE</Label>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(fmtPhone(e.target.value)); setNotFound(false); }} placeholder="(413) 555-0100" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={add} disabled={digits.length < 10 || busy} style={{ padding: "0 18px", background: digits.length >= 10 ? "rgba(232,168,56,.15)" : "rgba(255,255,255,.04)", border: `1.5px solid ${digits.length >= 10 ? "#E8A838" : "rgba(255,255,255,.08)"}`, borderRadius: 12, color: digits.length >= 10 ? "#D4A843" : "rgba(255,255,255,.25)", fontFamily: F, fontWeight: 800, cursor: "pointer" }}>{busy ? "…" : "Add"}</button>
        </div>
        {notFound && <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", fontFamily: F, marginBottom: 6 }}>They're not on BetBuddy yet. <u style={{ cursor: "pointer", color: "#22D3EE" }} onClick={() => setInvite(true)}>Send them an invite</u></div>}

        <div style={{ height: 14 }} />
        {friendIds.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,.52)", fontFamily: F, fontSize: 13 }}>No buddies yet. Share your link — anyone who joins from it is automatically in your crew.</div>
        ) : friendIds.map((id) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <Avatar contact={contacts[id]} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, fontFamily: F }}>{contacts[id].name}</div>
              {contacts[id].phone && <div style={{ fontSize: 11, color: "rgba(255,255,255,.57)", fontFamily: F }}>{fmtPhone(contacts[id].phone)}</div>}
            </div>
          </div>
        ))}
      </Sheet>
    </>
  );
}

export function ProfileSheet({ profile, onClose, onSave, onPhoto }) {
  const [name, setName] = useState(profile.name || "");
  const [color, setColor] = useState(profile.color || COLORS[0]);
  const [venmo, setVenmo] = useState(profile.venmo || "");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet onClose={onClose} z={600}>
      <SheetHeader title="Profile & Settings" onClose={onClose} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <Avatar contact={{ name, color, initials: name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase()).join("").slice(0, 2) || "?", photo: profile.photo_url }} size={72} showRing onUpload={onPhoto} />
      </div>
      <Label>NAME</Label>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} style={{ ...inputStyle, marginBottom: 14 }} />
      <Label>COLOR</Label>
      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={c} style={{ width: 36, height: 36, borderRadius: 10, background: `${c}30`, border: color === c ? `2.5px solid ${c}` : "2.5px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 16, height: 16, borderRadius: 5, background: c }} /></button>)}
      </div>
      <Label>VENMO (FOR CASH OUTS)</Label>
      <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@your-venmo" autoCapitalize="off" style={{ ...inputStyle, marginBottom: 16 }} />
      <div style={{ height: 4 }} />
      <BigButton disabled={!name.trim() || busy} onClick={async () => { setBusy(true); const ok = await onSave({ name: name.trim(), color, venmo: venmo.trim().replace(/^@/, "") || null }); setBusy(false); if (ok) onClose(); }}>{busy ? "Saving…" : "Save"}</BigButton>
    </Sheet>
  );
}

export function HowItWorks({ onClose }) {
  const items = [
    ["🤝", "Bet your friends, not a bookie", "Every bet is you vs. someone in your crew. No house, no vig — the winner gets the whole pot."],
    ["💵", "BuddyBucks = dollars", "Add funds by Venmo; 1 BuddyBuck is $1. Cash out any time — paid to your Venmo in 2–4 business days."],
    ["📏", "Point spreads", "Pick the favorite (−) or the underdog (+). The favorite has to win by more than the spread. Lands exactly on it? It's a push and you both get your money back."],
    ["🔒", "Locked lines", "The spread is locked when you send the challenge, even if the line moves later."],
    ["⏱", "Kickoff deadline", "Challenges nobody accepted by game time are cancelled and refunded automatically."],
    ["⚡", "Auto-settle", "When the game goes final, the app grades the bet and pays the winner — usually within minutes."],
    ["🎲", "The Field", "Post a bet to your whole crew. First person to take the other side locks it in."],
  ];
  return (
    <Sheet onClose={onClose} z={600}>
      <SheetHeader title="How BetBuddy works" onClose={onClose} />
      {items.map(([i, t, d]) => (
        <div key={t} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 22, width: 30, textAlign: "center", flexShrink: 0 }}>{i}</div>
          <div><div style={{ fontWeight: 800, fontSize: 14, fontFamily: F, marginBottom: 2 }}>{t}</div><div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", fontFamily: F, lineHeight: 1.45 }}>{d}</div></div>
        </div>
      ))}
    </Sheet>
  );
}

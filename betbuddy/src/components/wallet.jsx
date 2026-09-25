import { useEffect, useState } from "react";
import { F, GREEN_BTN, Sheet, SheetHeader, Label, inputStyle, AmountPicker, BigButton } from "./ui.jsx";
import { supabase } from "../lib/supabase.js";
import { BANK_VENMO, venmoPayUrl, timeAgo } from "../lib/util.js";

const KIND = {
  deposit: ["💰", "Deposit"], withdrawal: ["💸", "Cash out"], withdrawal_refund: ["↩️", "Cash out cancelled"],
  stake: ["🔒", "Bet stake"], stake_refund: ["↩️", "Stake returned"], payout: ["🏆", "Winnings"], adjustment: ["⚙️", "Adjustment"],
};

export function WalletSheet({ wallet, profile, onClose, onAddFunds, onCashOut }) {
  const [rows, setRows] = useState(null);
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    supabase.from("ledger").select("*").eq("user_id", profile.id).order("id", { ascending: false }).limit(40).then(({ data }) => setRows(data || []));
    Promise.all([
      supabase.from("deposit_requests").select("*").eq("user_id", profile.id).eq("status", "pending"),
      supabase.from("withdrawal_requests").select("*").eq("user_id", profile.id).eq("status", "pending"),
    ]).then(([d, w]) => setRequests([...(d.data || []).map((x) => ({ ...x, t: "dep" })), ...(w.data || []).map((x) => ({ ...x, t: "wd" }))]));
  }, [profile.id]);

  const stat = (label, v, c) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 900, color: c, fontFamily: F, lineHeight: 1 }}>${v}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", fontFamily: F, marginTop: 3 }}>{label}</div>
    </div>
  );
  return (
    <Sheet onClose={onClose} z={650}>
      <SheetHeader title="Wallet" sub="1 BuddyBuck = $1" onClose={onClose} />
      <div style={{ padding: "16px", background: "linear-gradient(145deg,rgba(232,168,56,.1),rgba(232,168,56,.02))", border: "1px solid rgba(232,168,56,.15)", borderRadius: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {stat("Available", wallet.available, "#D4A843")}
          {stat("Locked", wallet.locked, "#F97316")}
          {stat("Pending", wallet.pending, "#A855F7")}
        </div>
        {wallet.cashing_out > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontFamily: F, marginTop: 10 }}>💸 ${wallet.cashing_out} cash out on the way</div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button onClick={onAddFunds} style={{ flex: 1, padding: 14, background: GREEN_BTN, border: "none", borderRadius: 13, fontWeight: 800, fontSize: 14, fontFamily: F, color: "#0A0B0F", cursor: "pointer" }}>＋ Add Funds</button>
        <button onClick={onCashOut} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,.05)", border: "1.5px solid rgba(255,255,255,.1)", borderRadius: 13, fontWeight: 800, fontSize: 14, fontFamily: F, color: "#F0EDE8", cursor: "pointer" }}>Cash Out</button>
      </div>

      {requests.length > 0 && (
        <>
          <Label>WAITING ON THE BANK</Label>
          {requests.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(168,85,247,.06)", border: "1px solid rgba(168,85,247,.18)", borderRadius: 11, marginBottom: 6, fontFamily: F }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{r.t === "dep" ? "Deposit being confirmed" : `Cash out to @${r.venmo}`}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>{timeAgo(r.created_at)}{r.t === "wd" ? " · paid within 2–4 business days" : ` · note ${r.code}`}</div>
              </div>
              <div style={{ fontWeight: 900, color: "#A855F7" }}>${r.amount}</div>
            </div>
          ))}
          <div style={{ height: 10 }} />
        </>
      )}

      <Label>TRANSACTIONS</Label>
      {rows === null ? <div style={{ color: "rgba(255,255,255,.3)", fontFamily: F, fontSize: 13 }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: "rgba(255,255,255,.3)", fontFamily: F, fontSize: 13, padding: "10px 0" }}>No transactions yet — add funds to get started.</div>
        : rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontFamily: F }}>
            <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{KIND[r.kind]?.[0]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.memo || KIND[r.kind]?.[1]}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{timeAgo(r.created_at)}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 14, color: r.amount > 0 ? "#3DD68C" : "rgba(255,255,255,.55)" }}>{r.amount > 0 ? "+" : "−"}${Math.abs(r.amount)}</div>
          </div>
        ))}
    </Sheet>
  );
}

export function AddFundsSheet({ profile, onClose, onRequest }) {
  const [amt, setAmt] = useState("");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const n = Number(amt);
  const code = profile.deposit_code;

  if (!BANK_VENMO) {
    return (
      <Sheet onClose={onClose} z={700}>
        <SheetHeader title="Add Funds" onClose={onClose} />
        <div style={{ fontFamily: F, fontSize: 14, color: "rgba(255,255,255,.6)" }}>Deposits aren't set up yet. (Admin: set <code>VITE_BANK_VENMO</code> in Netlify and redeploy.)</div>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose} z={700}>
      {step === 1 && (
        <>
          <SheetHeader title="Add Funds" sub="Pay by Venmo · credited once confirmed" onClose={onClose} />
          <AmountPicker amt={amt} setAmt={setAmt} quick={[25, 50, 100, 250]} />
          <div style={{ height: 18 }} />
          <BigButton onClick={() => setStep(2)} disabled={!(n > 0 && n <= 10000)} bg={GREEN_BTN}>{n > 0 ? `Continue — $${n}` : "Enter an amount"}</BigButton>
        </>
      )}
      {step === 2 && (
        <>
          <SheetHeader title={`Send $${n} on Venmo`} sub="Two quick steps" onClose={onClose} />
          <div style={{ fontFamily: F, fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,.75)", marginBottom: 14 }}>
            <b style={{ color: "#F0EDE8" }}>1.</b> Pay <b style={{ color: "#3B82F6" }}>@{BANK_VENMO}</b> exactly <b>${n}</b> and put this code in the note so we know it's you:
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); }} style={{ width: "100%", padding: "16px", background: "#13151C", border: "1.5px dashed rgba(232,168,56,.5)", borderRadius: 14, color: "#D4A843", fontFamily: F, fontWeight: 900, fontSize: 26, letterSpacing: "3px", cursor: "pointer", marginBottom: 6 }}>{code}</button>
          <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.35)", fontFamily: F, marginBottom: 14 }}>{copied ? "Copied ✓" : "Tap to copy"}</div>
          <a href={venmoPayUrl(BANK_VENMO, n, code)} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", padding: "15px", background: "#3D95CE", borderRadius: 14, color: "#fff", fontFamily: F, fontWeight: 800, fontSize: 15, textDecoration: "none", marginBottom: 18 }}>Open Venmo →</a>
          <div style={{ fontFamily: F, fontSize: 14, color: "rgba(255,255,255,.75)", marginBottom: 12 }}><b style={{ color: "#F0EDE8" }}>2.</b> Come back and tap below. Your BuddyBucks show up as soon as it's confirmed.</div>
          <BigButton bg={GREEN_BTN} disabled={busy} onClick={async () => { setBusy(true); const ok = await onRequest(n); setBusy(false); if (ok) setStep(3); }}>{busy ? "Sending…" : `✓ I sent $${n}`}</BigButton>
          <button onClick={() => setStep(1)} style={{ marginTop: 10, background: "none", border: "none", color: "rgba(255,255,255,.35)", fontFamily: F, fontSize: 12, cursor: "pointer" }}>← Change amount</button>
        </>
      )}
      {step === 3 && (
        <div style={{ textAlign: "center", padding: "20px 0 8px", fontFamily: F }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>💰</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Got it!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginBottom: 20 }}>You'll see it in your balance (and a 🔔 alert) the moment your ${n} is added.</div>
          <BigButton onClick={onClose}>Done</BigButton>
        </div>
      )}
    </Sheet>
  );
}

export function CashOutSheet({ wallet, profile, onClose, onRequest }) {
  const [amt, setAmt] = useState("");
  const [venmo, setVenmo] = useState(profile.venmo || "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const n = Number(amt);
  const ok = n > 0 && n <= wallet.available && venmo.replace(/[@\s]/g, "").length > 1;
  if (done) {
    return (
      <Sheet onClose={onClose} z={700}>
        <div style={{ textAlign: "center", padding: "20px 0 8px", fontFamily: F }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>💸</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Cash out requested</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginBottom: 20 }}>${n} will be sent to @{venmo.replace(/^@/, "")} on Venmo within 2–4 business days. You'll get a 🔔 alert when it's sent.</div>
          <BigButton onClick={onClose}>Done</BigButton>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose} z={700}>
      <SheetHeader title="Cash Out" sub={`$${wallet.available} available · paid via Venmo in 2–4 business days`} onClose={onClose} />
      <AmountPicker amt={amt} setAmt={setAmt} quick={[25, 50, 100]} max={wallet.available} />
      <button onClick={() => setAmt(String(wallet.available))} disabled={!wallet.available} style={{ background: "none", border: "none", color: "#D4A843", fontFamily: F, fontWeight: 700, fontSize: 12, cursor: "pointer", margin: "8px 0 14px", padding: 0, textAlign: "left" }}>Cash out everything (${wallet.available})</button>
      <Label>YOUR VENMO</Label>
      <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@your-venmo" autoCapitalize="off" style={{ ...inputStyle, marginBottom: 18 }} />
      <BigButton disabled={!ok || busy} onClick={async () => { setBusy(true); const r = await onRequest(n, venmo); setBusy(false); if (r) setDone(true); }}>
        {busy ? "Requesting…" : n > 0 ? `Request $${n} cash out` : "Enter an amount"}
      </BigButton>
    </Sheet>
  );
}

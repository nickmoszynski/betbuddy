import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, configured, rpc, flushTexts } from "./lib/supabase.js";
import { mapGame, mapWager, mapProfile, resizePhoto, SPORT_COLOR, shortName, matchupText, FIELD_ENABLED, ENABLED_SPORTS } from "./lib/util.js";
import { setTeams, rankOf, hasRankings } from "./lib/teams.js";
import { F, GOLD_BTN, Avatar, Toasts, ActivityDrawer, Empty, SectionLabel, PushCard, PhotoButton } from "./components/ui.jsx";
import { pushState, enablePush, refreshPushSubscription } from "./lib/push.js";
import { BetSlip, InboxCard, ChatDrawer, ActiveBetCard, CompletedBetRow, ShowcaseCard, DashBar } from "./components/bets.jsx";
import { WalletSheet, AddFundsSheet, CashOutSheet } from "./components/wallet.jsx";
import { CrewSheet, ProfileSheet, HowItWorks } from "./components/crew.jsx";
import { Login, Onboarding, Wordmark } from "./components/auth.jsx";
import { AdminScreen } from "./components/admin.jsx";
import { StatsScreen } from "./components/stats.jsx";

const safeLS = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

// Capture ?invite=<id> before sign-in so it survives the login round-trip
(() => {
  const p = new URLSearchParams(location.search);
  const inv = p.get("invite");
  if (inv && /^[0-9a-f-]{36}$/i.test(inv)) safeLS.set("bb_invite", inv);
  if (inv) history.replaceState(null, "", location.pathname);
})();

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session) return setProfile(null);
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    setProfile(data);
  }, [session]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  if (!configured) return <SetupNeeded />;
  if (session === undefined || (session && !profile)) return <Splash />;
  if (!session) return <Login invited={!!safeLS.get("bb_invite")} />;
  if (!profile.name) {
    return <Onboarding profile={profile} onSave={async (fields) => {
      const { error } = await supabase.from("profiles").update(fields).eq("id", profile.id);
      if (error) return alert(error.message);
      await loadProfile();
    }} />;
  }
  return <Main profile={profile} reloadProfile={loadProfile} />;
}

function Main({ profile, reloadProfile }) {
  const me = profile.id;
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(location.search).get("tab");
    if (t) history.replaceState(null, "", location.pathname);
    return ["home", "inbox", "games", "locker"].includes(t) ? t : "home";
  });
  const [push, setPush] = useState(null);
  const [pushHidden, setPushHidden] = useState(() => Number(safeLS.get("bb_push_later") || 0) > Date.now());
  const [sportFilter, setSport] = useState("ALL");
  const [profiles, setProfiles] = useState([]);
  const [friendIds, setFriendIds] = useState([]);
  const [games, setGames] = useState([]);
  const [rawWagers, setRawWagers] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [wallet, setWallet] = useState({ available: 0, locked: 0, pending: 0, cashing_out: 0 });
  const [msgMeta, setMsgMeta] = useState([]);
  const [adminPending, setAdminPending] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [betSlipGame, setBetSlipGame] = useState(null);
  const [sheet, setSheet] = useState(null); // wallet | deposit | cashout | crew | profile | how | activity | admin
  const [chatBet, setChatBet] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const lastNotif = useRef(null);
  const chatRef = useRef(null);

  const toast = useCallback((type, msg, sub, amt) => {
    const id = ++toastId.current;
    setToasts((p) => [...p.slice(-2), { id, type, msg, sub, amt }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3800);
  }, []);

  /* ─── Data loading ─────────────────────────────────────────────── */
  const refresh = useCallback(async () => {
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    const until = new Date(Date.now() + 8 * 86400_000).toISOString();
    const [pr, fr, gm, wg, nt, wal, cnt] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("friendships").select("*"),
      supabase.from("games").select("*").gte("commence_time", since).lte("commence_time", until).order("commence_time"),
      supabase.from("wagers").select("*").or(`from_user.eq.${me},to_user.eq.${me},to_user.is.null`).order("created_at", { ascending: false }).limit(300),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(60),
      rpc("my_wallet").catch(() => null),
      rpc("game_bet_counts").catch(() => []),
    ]);
    const counts = Object.fromEntries((cnt || []).map((c) => [c.game_id, c.n]));
    let gRows = gm.data || [];
    const wRows = wg.data || [];
    const missing = [...new Set(wRows.map((w) => w.game_id))].filter((id) => !gRows.some((g) => g.id === id));
    if (missing.length) {
      const { data } = await supabase.from("games").select("*").in("id", missing);
      gRows = [...gRows, ...(data || [])];
    }
    const fIds = (fr.data || []).map((f) => (f.a === me ? f.b : f.a));
    setProfiles(pr.data || []);
    setFriendIds(fIds);
    setGames(gRows.map((g) => mapGame(g, counts)));
    // Admins can see everyone's open bets; only show Field bets from people in my crew
    setRawWagers(wRows.filter((w) => w.from_user === me || w.to_user === me || fIds.includes(w.from_user)));
    if (wal) setWallet(wal);

    const n = nt.data || [];
    if (lastNotif.current !== null) {
      n.filter((x) => x.id > lastNotif.current && !x.read).reverse().slice(-3).forEach((x) => toast(x.type, x.msg, x.sub, x.amt));
    }
    lastNotif.current = n.reduce((m, x) => Math.max(m, x.id), lastNotif.current ?? 0);
    setNotifs(n);

    const active = wRows.filter((w) => w.status === "locked").map((w) => w.id);
    if (active.length) {
      const { data } = await supabase.from("messages").select("id,wager_id,user_id,created_at").in("wager_id", active);
      setMsgMeta(data || []);
    }
    if (profile.is_admin) {
      const [d, w] = await Promise.all([
        supabase.from("deposit_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setAdminPending((d.count || 0) + (w.count || 0));
    }
    setLoaded(true);
  }, [me, profile.is_admin, toast]);

  // Join the inviter's crew once, right after first sign-in
  useEffect(() => {
    const inv = safeLS.get("bb_invite");
    if (!inv) return;
    safeLS.del("bb_invite");
    rpc("join_via_invite", { p_inviter: inv }).then(refresh).catch(() => {});
  }, [refresh]);

  const timer = useRef();
  const soon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => refresh().catch(() => {}), 400); }, [refresh]);

  useEffect(() => {
    refresh().catch((e) => toast("ERROR", "Couldn't load", e.message));
    const ch = supabase.channel("bb-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "wagers" }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${me}` }, soon)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games" }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => { if (p.new.wager_id === chatRef.current) setChatMsgs((c) => (c.some((m) => m.id === p.new.id) ? c : [...c, p.new])); soon(); })
      .subscribe();
    const iv = setInterval(soon, 30_000);
    const onVis = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVis);
    return () => { supabase.removeChannel(ch); clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [me, refresh, soon, toast]);

  // Count app opens for the admin dashboard (on load, and when returning after 30+ min)
  useEffect(() => {
    let last = 0;
    const ping = () => { if (Date.now() - last > 30 * 60_000) { last = Date.now(); rpc("touch").catch(() => {}); } };
    ping();
    const onVis = () => document.visibilityState === "visible" && ping();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
    refreshPushSubscription();
    const onMsg = (e) => {
      if (e.data?.type !== "open") return;
      const t = new URL(e.data.url).searchParams.get("tab");
      setTab(t || "home");
      soon();
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [soon]);
  const turnOnPush = async () => {
    try { await enablePush(); setPush("on"); toast("BET_ACCEPTED", "Alerts are on 🔔", "You'll get a buzz for challenges, results & payouts"); }
    catch (e) { toast("ERROR", e.message); pushState().then(setPush); }
  };
  const hidePush = () => { safeLS.set("bb_push_later", String(Date.now() + 3 * 86400_000)); setPushHidden(true); };

  // Team names, logos and AP ranks (refreshed server-side twice a day)
  const [, setTeamsVer] = useState(0);
  useEffect(() => {
    supabase.from("teams").select("league,name_key,short_name,abbr,color,logo,rank").limit(2000)
      .then(({ data }) => { if (data?.length) { setTeams(data); setTeamsVer((v) => v + 1); } });
  }, []);

  /* ─── Derived ───────────────────────────────────────────────────── */
  const contacts = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, mapProfile(p)])), [profiles]);
  const gamesById = useMemo(() => Object.fromEntries(games.map((g) => [g.id, g])), [games]);
  const wagers = useMemo(() => rawWagers.map((w) => mapWager(w, gamesById)), [rawWagers, gamesById]);
  const mine = (w) => w.from === me || w.to === me;
  const incoming = wagers.filter((w) => w.status === "pending" && w.to === me);
  const fieldOffers = !FIELD_ENABLED ? [] : wagers.filter((w) => w.status === "pending" && w.toField && w.from !== me && new Date(w.game.date) > new Date());
  const sent = wagers.filter((w) => w.status === "pending" && w.from === me);
  const activeBets = wagers.filter((w) => w.status === "locked" && mine(w)).sort((a, b) => new Date(a.game.date) - new Date(b.game.date));
  const history = wagers.filter((w) => ["settled", "void"].includes(w.status) && mine(w)).sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt)).slice(0, 25);
  const inboxCount = incoming.length + fieldOffers.length;
  const unread = notifs.filter((n) => !n.read).length;
  const unreadFor = (id) => {
    const seen = Number(safeLS.get(`bb_seen_${id}`) || 0);
    return msgMeta.filter((m) => m.wager_id === id && m.user_id !== me && new Date(m.created_at).getTime() > seen).length;
  };

  const now = Date.now();
  // College games: only ones with an AP Top 25 team (once rankings are loaded)
  const onBoard = (g) => ENABLED_SPORTS.includes(g.sport) &&
    (!["NCAAF", "NCAAB"].includes(g.sport) || !hasRankings(g.sport) || rankOf(g.sport, g.home) || rankOf(g.sport, g.away));
  const board = games.filter((g) => onBoard(g) && !g.settled && g.status !== "final" && new Date(g.date).getTime() > now - 4 * 3600_000 && (sportFilter === "ALL" || g.sport === sportFilter));
  const upcoming = board.filter((g) => new Date(g.date).getTime() > now);
  const live = board.filter((g) => new Date(g.date).getTime() <= now);
  const primetime = upcoming.filter((g) => g.importance >= 3);
  const matchups = upcoming.filter((g) => g.kind === "h2h");
  const rest = upcoming.filter((g) => g.importance < 3 && g.kind !== "h2h");
  const sportsAvail = ["ALL", ...ENABLED_SPORTS.filter((s) => games.some((g) => g.sport === s && onBoard(g)))];

  /* ─── Actions ───────────────────────────────────────────────────── */
  const run = async (fn, after) => {
    try { const r = await fn(); after?.(r); flushTexts(); await refresh(); return r ?? true; }
    catch (e) { toast("ERROR", e.message); return false; }
  };
  const sendWager = ({ game, side, amount, message, to }) =>
    run(() => rpc("send_wager", { p_game_id: game.id, p_side: side, p_amount: amount, p_message: message || null, p_to: to }), () => {
      toast(to ? "BET_RECEIVED" : "FIELD_LOCKED", to ? `Challenge sent to ${contacts[to]?.name.split(" ")[0]}!` : "Posted to The Field 🎲", "Your stake is held until they respond", amount);
      setTab("inbox");
    });
  const acceptWager = (w) => run(() => rpc("accept_wager", { p_id: w.id }), () => { toast("BET_ACCEPTED", `Locked in! $${w.amount} on the line`, matchupText(w.game), w.amount); setTab("home"); });
  const denyWager = (w) => run(() => rpc("decline_wager", { p_id: w.id }), () => toast("BET_DECLINED", "Challenge declined", `$${w.amount} returned to ${contacts[w.from]?.name.split(" ")[0]}`));
  const counterWager = (w, amt) => run(() => rpc("counter_wager", { p_id: w.id, p_amount: amt }), () => toast("BET_COUNTER", `Counter of $${amt} sent`, "Their original stake was refunded"));
  const cancelWager = (w) => run(() => rpc("cancel_wager", { p_id: w.id }), () => toast("WAGER_CANCELLED", "Challenge cancelled", `$${w.amount} back in your balance`));
  const sendToField = (w) => run(() => rpc("send_to_field", { p_id: w.id }), () => toast("FIELD_LOCKED", "Opened to The Field 🎲", "Anyone in your crew can take it"));
  const requestDeposit = (n) => run(() => rpc("request_deposit", { p_amount: n }));
  const requestCashOut = (n, venmo) => run(() => rpc("request_withdrawal", { p_amount: n, p_venmo: venmo }), reloadProfile);
  const addByPhone = async (digits) => {
    try {
      const id = await rpc("add_friend_by_phone", { p_phone: digits });
      if (id) { toast("BUDDY_UP", "Added to your crew 👊"); await refresh(); }
      return id;
    } catch (e) { toast("ERROR", e.message); return false; }
  };
  const saveProfile = async (fields) => {
    const { error } = await supabase.from("profiles").update(fields).eq("id", me);
    if (error) { toast("ERROR", error.message); return false; }
    await reloadProfile(); await refresh(); toast("BUDDY_UP", "Profile saved");
    return true;
  };
  const uploadPhoto = async (file) => {
    try { await saveProfile({ photo_url: await resizePhoto(file) }); } catch { toast("ERROR", "Couldn't use that photo"); }
  };
  const openChat = async (bet) => {
    chatRef.current = bet.id;
    setChatBet(bet);
    safeLS.set(`bb_seen_${bet.id}`, String(Date.now()));
    const { data } = await supabase.from("messages").select("*").eq("wager_id", bet.id).order("created_at");
    setChatMsgs(data || []);
  };
  const sendMsg = async (wagerId, body) => {
    const { data, error } = await supabase.from("messages").insert({ wager_id: wagerId, user_id: me, body }).select().single();
    if (error) return toast("ERROR", error.message);
    setChatMsgs((c) => (c.some((m) => m.id === data.id) ? c : [...c, data]));
    safeLS.set(`bb_seen_${wagerId}`, String(Date.now()));
  };
  const openActivity = async () => {
    setSheet("activity");
    if (unread) {
      await supabase.from("notifications").update({ read: true }).eq("user_id", me).eq("read", false);
      setTimeout(() => setNotifs((p) => p.map((n) => ({ ...n, read: true }))), 600);
    }
  };
  const clearActivity = async () => { await supabase.from("notifications").delete().eq("user_id", me); setNotifs([]); };

  const meContact = contacts[me] || mapProfile(profile);
  const allContacts = { ...contacts, [me]: meContact };

  /* ─── Render ────────────────────────────────────────────────────── */
  return (
    <div style={{ background: "#0A0B0F", minHeight: "100dvh", color: "#F0EDE8", fontFamily: F, maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 90 }}>
      <div style={{ position: "fixed", top: -80, left: "50%", transform: "translateX(-50%)", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(212,168,67,.05) 0%,transparent 70%)", filter: "blur(60px)", pointerEvents: "none" }} />
      <Toasts toasts={toasts} />

      {sheet === "activity" && <ActivityDrawer notifs={notifs} contacts={allContacts} onClose={() => setSheet(null)} onClear={clearActivity} />}
      {sheet === "wallet" && <WalletSheet wallet={wallet} profile={profile} onClose={() => setSheet(null)} onAddFunds={() => setSheet("deposit")} onCashOut={() => setSheet("cashout")} />}
      {sheet === "deposit" && <AddFundsSheet profile={profile} onClose={() => setSheet(null)} onRequest={requestDeposit} />}
      {sheet === "cashout" && <CashOutSheet wallet={wallet} profile={profile} onClose={() => setSheet(null)} onRequest={requestCashOut} />}
      {sheet === "crew" && <CrewSheet me={me} contacts={allContacts} friendIds={friendIds} onClose={() => setSheet(null)} onAddByPhone={addByPhone} toast={toast} />}
      {sheet === "profile" && <ProfileSheet profile={profile} onClose={() => setSheet(null)} onSave={saveProfile} onPhoto={uploadPhoto} />}
      {sheet === "how" && <HowItWorks onClose={() => setSheet(null)} />}
      {sheet === "stats" && <StatsScreen onClose={() => setSheet(null)} toast={toast} />}
      {sheet === "admin" && <AdminScreen onClose={() => { setSheet(null); refresh(); }} toast={toast} onChanged={refresh} />}
      {chatBet && <ChatDrawer bet={chatBet} me={me} contacts={allContacts} messages={chatMsgs.filter((m) => m.wager_id === chatBet.id)} onClose={() => { safeLS.set(`bb_seen_${chatBet.id}`, String(Date.now())); setChatBet(null); setChatMsgs([]); chatRef.current = null; }} onSend={sendMsg} />}
      {betSlipGame && <BetSlip game={betSlipGame} me={me} contacts={allContacts} friendIds={friendIds} available={wallet.available} onSend={sendWager} onClose={() => setBetSlipGame(null)} onDeposit={() => { setBetSlipGame(null); setSheet("deposit"); }} />}

      {/* ── HEADER ── */}
      <div style={{ padding: "calc(env(safe-area-inset-top) + 12px) 14px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "rgba(10,11,15,.94)", backdropFilter: "blur(16px)", zIndex: 50, borderBottom: "1px solid rgba(255,255,255,.04)", gap: 8 }}>
        <Wordmark />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setSheet("wallet")} aria-label="Wallet" style={{ display: "flex", background: "#1A1D27", border: "1px solid rgba(255,255,255,.06)", borderRadius: 13, cursor: "pointer", overflow: "hidden", padding: 0 }}>
            {[["AVAIL", wallet.available, "#D4A843", "rgba(232,168,56,.6)"], ["LOCKED", wallet.locked, "#F97316", "rgba(249,115,22,.6)"], ["PENDING", wallet.pending, "#A855F7", "rgba(168,85,247,.6)"]].map(([l, v, c, lc], i) => (
              <div key={l} style={{ padding: "5px 8px", borderRight: i < 2 ? "1px solid rgba(255,255,255,.05)" : "none", textAlign: "left" }}>
                <div style={{ fontSize: 7, color: lc, letterSpacing: "0.8px", fontWeight: 700, marginBottom: 1, fontFamily: F }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: c, lineHeight: 1, fontFamily: F }}>${v}</div>
              </div>
            ))}
          </button>
          <button onClick={openActivity} aria-label="Activity" style={{ position: "relative", background: "#1A1D27", border: "1px solid rgba(255,255,255,.05)", borderRadius: 11, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,.65)"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
            {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#F25F5C", color: "#fff", borderRadius: 99, fontSize: 8, fontWeight: 900, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0A0B0F" }}>{unread > 9 ? "9+" : unread}</span>}
          </button>
          <button onClick={() => setTab("locker")} aria-label="Account" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}><Avatar contact={meContact} size={34} showRing /></button>
        </div>
      </div>

      {!loaded && <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,.52)", fontFamily: F }}>Loading…</div>}

      {/* ════ HOME ════ */}
      {loaded && tab === "home" && (
        <div style={{ padding: "12px 14px 0" }}>
          {!pushHidden && <PushCard state={push} onEnable={turnOnPush} onDismiss={hidePush} />}
          <DashBar activeBets={activeBets} pendingOut={sent.length} pendingIn={inboxCount} onTabClick={() => setTab("inbox")} />
          {wallet.available === 0 && activeBets.length === 0 && sent.length === 0 && (
            <button onClick={() => setSheet("deposit")} style={{ width: "100%", textAlign: "left", padding: "14px 16px", background: "linear-gradient(135deg,rgba(74,222,128,.12),rgba(74,222,128,.03))", border: "1px solid rgba(74,222,128,.3)", borderRadius: 14, marginBottom: 12, cursor: "pointer", color: "#F0EDE8", fontFamily: F }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>💰 Add funds to start betting</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 2 }}>Venmo in, get BuddyBucks 1:1. Cash out any time.</div>
            </button>
          )}
          {friendIds.length === 0 && (
            <button onClick={() => setSheet("crew")} style={{ width: "100%", textAlign: "left", padding: "14px 16px", background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.3)", borderRadius: 14, marginBottom: 12, cursor: "pointer", color: "#F0EDE8", fontFamily: F }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>👊 Build your crew</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 2 }}>Share your invite link — anyone who joins from it can bet you.</div>
            </button>
          )}
          {activeBets.length > 0 && <>
            <SectionLabel>IN PLAY</SectionLabel>
            {activeBets.map((b) => <ActiveBetCard key={b.id} bet={b} me={me} contacts={allContacts} onOpenChat={() => openChat(b)} unreadCount={unreadFor(b.id)} />)}
          </>}
          {history.length > 0 && <>
            <SectionLabel style={{ marginTop: activeBets.length ? 20 : 0 }}>HISTORY</SectionLabel>
            {history.map((b) => <CompletedBetRow key={b.id} bet={b} me={me} contacts={allContacts} />)}
          </>}
          {activeBets.length === 0 && history.length === 0 && <Empty big="$0" title="No active bets" sub="Browse games and send a challenge" cta="Browse Games →" onCta={() => setTab("games")} />}
        </div>
      )}

      {/* ════ INBOX ════ */}
      {loaded && tab === "inbox" && (
        <div style={{ padding: "12px 14px 0" }}>
          {incoming.length > 0 && <>
            <SectionLabel color="#D4A843"><span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#D4A843", marginRight: 6, animation: "livePulse 1.4s infinite" }} />RESPOND NOW · {incoming.length} INCOMING</SectionLabel>
            <div style={{ padding: "10px 14px", background: "rgba(232,168,56,.07)", border: "1px solid rgba(232,168,56,.15)", borderRadius: 14, marginBottom: 12, fontSize: 12, color: "rgba(232,168,56,.85)", fontFamily: F }}>⚡ Their money is held waiting on you. Challenges expire at kickoff.</div>
            {incoming.sort((a, b) => new Date(a.game.date) - new Date(b.game.date)).map((w) => <InboxCard key={w.id} w={w} me={me} contacts={allContacts} onAccept={acceptWager} onDeny={denyWager} onCounter={counterWager} onCancel={cancelWager} onSendToField={sendToField} />)}
          </>}
          {fieldOffers.length > 0 && <>
            <SectionLabel color="#A855F7" style={{ marginTop: incoming.length ? 18 : 0 }}>🎲 OPEN BETS FROM YOUR CREW</SectionLabel>
            {fieldOffers.map((w) => <InboxCard key={w.id} w={w} me={me} contacts={allContacts} onAccept={acceptWager} />)}
          </>}
          {sent.length > 0 && <>
            <SectionLabel style={{ marginTop: inboxCount ? 18 : 0 }}>SENT & PENDING</SectionLabel>
            {sent.map((w) => <InboxCard key={w.id} w={w} me={me} contacts={allContacts} onCancel={cancelWager} onSendToField={sendToField} />)}
          </>}
          {inboxCount === 0 && sent.length === 0 && <Empty big="📬" title="Inbox is clear" sub="Send a challenge from the Games tab" cta="Browse Games →" onCta={() => setTab("games")} />}
        </div>
      )}

      {/* ════ GAMES ════ */}
      {loaded && tab === "games" && (
        <div style={{ padding: "12px 14px 0" }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.8px" }}>Games</div>
            <div style={{ fontSize: 13, color: "rgba(240,237,232,.62)", marginTop: 2 }}>Tap a game to challenge your crew</div>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
            {sportsAvail.map((s) => {
              const c = SPORT_COLOR[s] || "#D4A843", on = sportFilter === s;
              return <button key={s} onClick={() => setSport(s)} style={{ flexShrink: 0, padding: "7px 16px", borderRadius: 20, fontWeight: 700, fontSize: 11, fontFamily: F, cursor: "pointer", border: `1.5px solid ${on ? c : "rgba(255,255,255,.08)"}`, background: on ? `${c}16` : "rgba(255,255,255,.03)", color: on ? c : "rgba(255,255,255,.45)" }}>{s}</button>;
            })}
          </div>
          {board.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,.52)", fontFamily: F, fontSize: 14 }}>No games posted{sportFilter !== "ALL" ? ` for ${sportFilter}` : ""} yet.<br /><span style={{ fontSize: 12 }}>Lines refresh a few times a day.</span></div>}
          {primetime.length > 0 && <><SectionLabel color="rgba(212,168,67,.75)">🔥 PRIMETIME</SectionLabel>{primetime.map((g) => <ShowcaseCard key={g.id} game={g} onTap={setBetSlipGame} />)}</>}
          {matchups.length > 0 && <><SectionLabel color="rgba(163,230,53,.8)" style={{ marginTop: primetime.length ? 14 : 0 }}>⛳🏎 HEAD-TO-HEAD MATCHUPS · EVEN MONEY</SectionLabel>{matchups.map((g) => <ShowcaseCard key={g.id} game={g} onTap={setBetSlipGame} />)}</>}
          {rest.length > 0 && <><SectionLabel style={{ marginTop: primetime.length || matchups.length ? 14 : 0 }}>UPCOMING</SectionLabel>{rest.map((g) => <ShowcaseCard key={g.id} game={g} onTap={setBetSlipGame} />)}</>}
          {live.length > 0 && <><SectionLabel color="rgba(61,214,140,.7)" style={{ marginTop: 14 }}>IN PROGRESS</SectionLabel>{live.map((g) => <ShowcaseCard key={g.id} game={g} onTap={setBetSlipGame} />)}</>}
        </div>
      )}

      {/* ════ LOCKER ════ */}
      {loaded && tab === "locker" && (
        <div style={{ padding: "12px 14px 0" }}>
          <div style={{ padding: 16, background: "linear-gradient(145deg,rgba(232,168,56,.08),rgba(232,168,56,.02))", border: "1px solid rgba(232,168,56,.12)", borderRadius: 20, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar contact={meContact} size={60} showRing onUpload={uploadPhoto} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{profile.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.57)" }}>{profile.venmo ? `@${profile.venmo}` : ""}</div>
              <PhotoButton onFile={uploadPhoto} hasPhoto={!!profile.photo_url} />
              <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                {[["Available", wallet.available, "#D4A843"], ["Locked", wallet.locked, "#F97316"], ["Pending", wallet.pending, "#A855F7"]].map(([l, v, c]) => (
                  <div key={l}><div style={{ fontSize: 15, fontWeight: 900, color: c, lineHeight: 1 }}>${v}</div><div style={{ fontSize: 9, color: "rgba(255,255,255,.57)" }}>{l}</div></div>
                ))}
              </div>
            </div>
          </div>
          {[
            profile.is_admin && { icon: "📊", label: "Dashboard (Admin)", sub: "Players, activity, $ volume, top games", action: () => setSheet("stats") },
            profile.is_admin && { icon: "🏦", label: "The Bank (Admin)", sub: adminPending ? `${adminPending} waiting on you` : "Deposits, cash-outs, members", badge: adminPending, action: () => setSheet("admin") },
            { icon: "💰", label: "Add Funds", sub: "Venmo in, BuddyBucks 1:1", action: () => setSheet("deposit") },
            { icon: "💸", label: "Cash Out", sub: "Paid to your Venmo in 2–4 business days", action: () => setSheet("cashout") },
            { icon: "🧾", label: "Wallet & Transactions", sub: "Every dollar in and out", action: () => setSheet("wallet") },
            { icon: "👥", label: "My Crew", sub: `${friendIds.length} ${friendIds.length === 1 ? "buddy" : "buddies"} · invite more`, action: () => setSheet("crew") },
            { icon: "🔔", label: "Activity", sub: `${unread} unread`, action: openActivity },
            { icon: "📖", label: "How it works", sub: "Spreads, pushes, payouts", action: () => setSheet("how") },
            { icon: push === "on" ? "🔔" : "🔕", label: "Alerts", sub: { on: "On for this device", off: "Off — tap to turn on", blocked: "Blocked in your phone settings", "ios-install": "Add BetBuddy to your Home Screen first", unsupported: "Not supported in this browser" }[push] || "", action: () => { if (push === "off") turnOnPush(); else { setPushHidden(false); safeLS.del("bb_push_later"); setTab("home"); } } },
            { icon: "⚙️", label: "Profile & Settings", sub: "Name, color, Venmo", action: () => setSheet("profile") },
            { icon: "↪️", label: "Sign out", sub: "", action: () => supabase.auth.signOut() },
          ].filter(Boolean).map((item) => (
            <button key={item.label} onClick={item.action} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", marginBottom: 6, background: "#13151C", border: `1px solid ${item.badge ? "rgba(59,130,246,.4)" : "rgba(255,255,255,.05)"}`, borderRadius: 15, cursor: "pointer", textAlign: "left", color: "#F0EDE8" }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,255,255,.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, fontFamily: F }}>{item.label}</div>
                {item.sub && <div style={{ fontSize: 11, color: item.badge ? "#60A5FA" : "rgba(255,255,255,.35)", fontFamily: F }}>{item.sub}</div>}
              </div>
              {item.badge ? <span style={{ background: "#3B82F6", color: "#fff", borderRadius: 99, fontSize: 11, fontWeight: 900, padding: "2px 8px" }}>{item.badge}</span> : <span style={{ fontSize: 16, color: "rgba(255,255,255,.42)" }}>›</span>}
            </button>
          ))}
          <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,.42)", padding: "14px 0", fontFamily: F }}>BetBuddy · private friends & family app · 21+</div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: "linear-gradient(to top,rgba(10,11,15,.99) 60%,rgba(10,11,15,.9))", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-around", padding: "10px 0 max(env(safe-area-inset-bottom),14px)", zIndex: 100, backdropFilter: "blur(20px)" }}>
        {[
          { id: "home", label: "Home", path: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" },
          { id: "inbox", label: "Inbox", path: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" },
          { id: "games", label: "Games", path: "M21 6.5c0-2.5-2-4.5-4.5-4.5h-9C5 2 3 4 3 6.5v11C3 20 5 22 7.5 22h9c2.5 0 4.5-2 4.5-4.5v-11zM12 17.5c-3 0-5.5-2.5-5.5-5.5S9 6.5 12 6.5s5.5 2.5 5.5 5.5-2.5 5.5-5.5 5.5zm0-9c-1.9 0-3.5 1.6-3.5 3.5s1.6 3.5 3.5 3.5 3.5-1.6 3.5-3.5-1.6-3.5-3.5-3.5z" },
          { id: "locker", label: "Locker", path: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" },
        ].map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", cursor: "pointer", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "2px 16px" }}>
              {on && <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", width: 24, height: 3, borderRadius: "0 0 3px 3px", background: "linear-gradient(90deg,#E8A838,#F59E0B)", boxShadow: "0 0 8px rgba(232,168,56,.5)" }} />}
              <svg width={on ? 22 : 20} height={on ? 22 : 20} viewBox="0 0 24 24" fill={on ? "#D4A843" : "rgba(255,255,255,.35)"}><path d={t.path} /></svg>
              <span style={{ fontSize: 10, fontFamily: F, fontWeight: on ? 700 : 500, color: on ? "#D4A843" : "rgba(255,255,255,.35)" }}>{t.label}</span>
              {t.id === "inbox" && inboxCount > 0 && <span style={{ position: "absolute", top: -2, right: 6, background: "#F25F5C", color: "#fff", borderRadius: 99, fontSize: 8, fontWeight: 900, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid #0A0B0F" }}>{inboxCount}</span>}
              {t.id === "home" && activeBets.length > 0 && <div style={{ position: "absolute", top: 0, right: 10, width: 5, height: 5, borderRadius: "50%", background: "#3DD68C" }} />}
              {t.id === "locker" && adminPending > 0 && <div style={{ position: "absolute", top: 0, right: 10, width: 6, height: 6, borderRadius: "50%", background: "#3B82F6" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const Splash = () => (
  <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}><Wordmark big /></div>
);

const SetupNeeded = () => (
  <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: F }}>
    <Wordmark big />
    <div style={{ marginTop: 24, color: "rgba(255,255,255,.6)", maxWidth: 340, lineHeight: 1.5 }}>Almost there — add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your Netlify environment variables and redeploy. See SETUP.md.</div>
  </div>
);

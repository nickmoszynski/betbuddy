# BetBuddy 🤝

Peer-to-peer sports wagers for a private crew of friends and family. There's no house and no vig: you bet a buddy, and the winner takes the pot.

- **Sign in** with a text-message code (no passwords)
- **Games** with real point spreads (NFL, college football, NBA, college basketball, MLB, NHL) from The Odds API
- **Challenge** a buddy, post to **The Field**, or **accept / decline / counter** incoming challenges
- **Auto-settle** when the game goes final, including pushes
- **BuddyBucks** wallet (1 = $1): Venmo deposits and cash-outs confirmed by the admin ("The Bank")
- **Push notifications** to the lock screen for every challenge, result, and payout
- **Trash-talk chat** on every bet, an activity feed, and a "Nudge by text" button
- **Admin dashboard**: players, daily actives, bets and $ volume per day, most-bet games, leaderboard
- Installable to the home screen (PWA)

Stack: React + Vite, Supabase (Postgres, Auth, Realtime), and Netlify (hosting + scheduled functions), with Twilio for texts.

**→ See [SETUP.md](SETUP.md) to deploy.**

```
src/                 React app (UI ported from the v12 prototype)
supabase/migrations  Schema, security rules, and all money logic
netlify/functions    Odds/score sync, auto-settle, text sending
test/                SQL scenario tests, race test, local Supabase stand-in, Playwright e2e
```

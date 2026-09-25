# BetBuddy setup guide

Plan on about 45 minutes of clicking.

## How it fits together

```
Phone browser (React app, installable to home screen)
   │  sign-in with text code · bets · chat · wallet
   ▼
Supabase (Postgres + Auth + Realtime)
   • all money rules live in the database (supabase/migrations/001_betbuddy.sql)
   • every balance change is a row in the `ledger` table
   ▲
Netlify
   • hosts the app
   • `tick` function runs every minute:
       sends queued texts → pulls lines (every 4h) → pulls scores for games
       with money on them (every 10 min) → auto-settles finals
   • /api/flush-sms sends texts instantly after an action
   • /api/sync-now is the admin "Refresh games now" button
   ▲
The Odds API (spreads + scores) · Twilio Verify (login codes)
```

---

## 1. Supabase (database + login)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick the US East region and save the database password somewhere.
2. Open **SQL Editor** → **New query**, paste the whole of `supabase/migrations/001_betbuddy.sql`, and click **Run**. You should see "Success. No rows returned." Then do the same with `supabase/migrations/002_push.sql` (push notifications).
3. Open **Project Settings → API** and copy three values:
   - Project URL → `VITE_SUPABASE_URL` and `SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (this one is secret; keep it server-side only)
4. **Authentication → Sign In / Providers → Phone**: turn it on and choose **Twilio Verify**. Paste in your Twilio Account SID, Auth Token, and Verify Service SID from step 3.
   - Until your Twilio compliance profile is approved, add yourself under **Test phone numbers and OTPs** (for example `14135550100=123456`) so you can log in without a real text.
5. **Authentication → URL Configuration**: set **Site URL** to your Netlify URL once you have it.

> **The first person to sign in becomes the admin (the bank),** so make sure that's you.

## 2. The Odds API (lines + scores)

Get a key at [the-odds-api.com](https://the-odds-api.com). The free 500-credit plan works for testing. For regular use during football season, pick the **20K plan (~$30/mo)**.

Credit usage: each line refresh costs 1 credit per in-season sport, every 4 hours. Score checks cost 2 credits every 10 minutes, and only while a game with a locked bet is in progress. You can tune this with `ODDS_REFRESH_MINUTES`, `SCORES_REFRESH_MINUTES`, and `SPORTS`.

## 3. Twilio (login codes)

Use **Twilio Verify** (Identity → Verify → Services → Create a service named `BetBuddy` with the SMS channel turned on). Verify sends the login codes from Twilio's own registered senders, so you don't need to buy a number or register one. In Supabase, choose **Twilio Verify** as the SMS provider and paste in the Account SID, Auth Token, and Verify Service SID. Upgrade the Twilio account and get your compliance profile approved so codes can reach any number.

Bet alerts are **not** sent by text, because carriers disallow gambling content on business numbers. They go out as **push notifications** instead (see below). A "Nudge by text" button also opens *your own* Messages app with a pre-written text to your buddy.

## 4. Netlify (hosting + background job)

1. Push this folder to a GitHub repo, then in Netlify go to **Add new site → Import from Git**. The build settings come from `netlify.toml`.
2. Under **Site configuration → Environment variables**, add every variable from `.env.example`:

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | From Supabase step 3 |
| `VITE_BANK_VENMO` | **Your** Venmo handle (no @). People send deposits here. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | From Supabase step 3 |
| `ODDS_API_KEY` | From step 2 |

3. **Deploy**. Then open **Functions** in Netlify: `tick` should be listed as *Scheduled*.
4. Put the Netlify URL into Supabase's Site URL (step 1.5). A custom domain works too.

## 5. First run

1. Open the site on your phone and sign in. You're the admin.
2. In **Locker → The Bank**, tap **⟳ Refresh games & scores now** to load lines right away instead of waiting for the next run.
3. In **Locker → My Crew → Share my invite link**, send the link to Dad and your uncle. Anyone who signs up through your link joins your crew automatically.
4. On iPhone, tap **Share → Add to Home Screen** and it behaves like an app.

## Push notifications

Every alert (new challenge, accepted, countered, open Field bet, win/loss, deposit credited, cash-out sent) is pushed to the person's phone automatically, within seconds. There's nothing to configure: the signing keys are generated on the server the first time they're needed.

- **iPhone (iOS 16.4+):** open the site in Safari → **Share → Add to Home Screen** → open BetBuddy from the new icon → tap **Turn on alerts**. The app shows these steps on the Home screen.
- **Android / desktop Chrome:** tap **Turn on alerts** on the Home screen. Installing is optional.
- If someone taps "Don't allow", they have to re-enable it in their phone's Settings → Notifications → BetBuddy.

## Running the bank (your 2 taps)

- **Deposits:** someone Venmos you with their code (for example `BB-7K2QF`) in the note and taps "I sent it". You get a text. In **The Bank**, check your Venmo and tap **✓ Received — credit it**.
- **Cash-outs:** the money comes out of their balance right away, so it can't be bet. You get a text. Tap **Pay on Venmo** (it opens with the amount filled in), then **✓ Paid**. Or tap **Refund** to put it back.
- **Stuck bets:** if a game is postponed or the score feed misses it, it appears under **Bets needing attention**. Enter the final score or void the bet, which refunds both people.
- **Reconciliation:** the blue card at the top shows what your Venmo should be holding (deposits minus payouts). If it ever disagrees with Venmo, something was credited by mistake.

## Rules built into the database

- Whole dollars only, $1–$10,000 per bet, and you can't bet more than your available balance. Double-taps and race conditions are blocked with a row lock (tested with 10 simultaneous sends).
- The line is **locked at send time**, so later line moves don't change the bet.
- A **push** (landing exactly on the spread) refunds both sides.
- Unaccepted challenges **expire at kickoff** and are refunded.
- **Counter:** declines the original, refunds the sender, and sends a new challenge back on the opposite side at the same line.
- **The Field:** an open bet that anyone in the sender's crew can take. The first to accept locks it.
- The app can't write to money tables directly. Every change goes through a checked database function, and row-level security means people only see their own crew's data.

## Testing locally

```bash
npm install
npm run test:db        # runs 12 money scenarios + permission checks against local Postgres
cp .env.example .env   # fill in values, then:
npm run dev
```

`test/` also has a Supabase stand-in (`test/shim`) and a full Playwright walkthrough (`test/e2e_ui.py`) covering sign-up, invite, deposit, challenge, accept, chat, auto-settle, and cash-out.

-- ════════════════════════════════════════════════════════════════════
-- BetBuddy — database schema, security, and all money logic
-- Run once in Supabase → SQL Editor. Safe to read top to bottom.
--
-- Money model (1 BuddyBuck = $1, whole dollars only):
--   • Every balance change is a row in `ledger`. Available balance = SUM(ledger).
--   • Sending a challenge takes the stake out of your balance immediately
--     (shown as PENDING). Accepting takes the other stake (both LOCKED).
--   • Settlement pays the winner 2× the stake. Push = both refunded.
--   • Deposits/cash-outs are requests the admin (the bank) approves.
--   • Clients can never write money tables directly — only via the
--     functions below, which check balances inside a row lock.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── Tables ──────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null default '',
  phone         text unique,                 -- digits incl. country code, e.g. 14135550100
  color         text not null default '#D4A843',
  photo_url     text,                        -- small data: URL (resized client-side)
  venmo         text,                        -- their Venmo handle for cash-outs
  sms_alerts    boolean not null default true,
  is_admin      boolean not null default false,
  deposit_code  text unique not null default ('BB-' || upper(substr(md5(gen_random_uuid()::text), 1, 5))),
  created_at    timestamptz not null default now()
);

create table public.friendships (
  a uuid not null references public.profiles(id) on delete cascade,
  b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

create table public.games (
  id             text primary key,             -- The Odds API event id
  sport          text not null,                -- NFL, NCAAF, NBA, NCAAB, MLB, NHL
  sport_key      text not null,                -- americanfootball_nfl, ...
  home           text not null,
  away           text not null,
  commence_time  timestamptz not null,
  fav_team       text,                         -- team the spread applies to
  spread         numeric(5,1),                 -- <= 0, e.g. -3.5 (0 = pick'em)
  status         text not null default 'upcoming' check (status in ('upcoming','live','final')),
  home_score     int,
  away_score     int,
  settled        boolean not null default false,
  updated_at     timestamptz not null default now()
);
create index games_commence_idx on public.games (commence_time);

create table public.wagers (
  id            uuid primary key default gen_random_uuid(),
  game_id       text not null references public.games(id),
  from_user     uuid not null references public.profiles(id),
  to_user       uuid references public.profiles(id),     -- null = open to The Field (any friend)
  side          text not null check (side in ('fav','dog')), -- from_user's side
  fav_team      text not null,                            -- line snapshot at send time
  spread        numeric(5,1) not null check (spread <= 0),
  amount        int not null check (amount between 1 and 10000),
  message       text check (char_length(message) <= 140),
  status        text not null default 'pending'
                check (status in ('pending','locked','settled','declined','cancelled','expired','void')),
  winner        uuid references public.profiles(id),      -- null + settled = push
  countered_from uuid references public.wagers(id),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  settled_at    timestamptz,
  check (to_user is null or to_user <> from_user)
);
create index wagers_from_idx on public.wagers (from_user);
create index wagers_to_idx   on public.wagers (to_user);
create index wagers_game_idx on public.wagers (game_id, status);

create table public.ledger (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id),
  amount     int not null check (amount <> 0),   -- + credit / - debit
  kind       text not null check (kind in ('deposit','withdrawal','withdrawal_refund','stake','stake_refund','payout','adjustment')),
  wager_id   uuid references public.wagers(id),
  ref_id     uuid,
  memo       text,
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger (user_id);

create table public.deposit_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  amount      int not null check (amount between 1 and 10000),
  code        text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create table public.withdrawal_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  amount      int not null check (amount between 1 and 10000),
  venmo       text not null,
  status      text not null default 'pending' check (status in ('pending','paid','rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create table public.messages (
  id         bigserial primary key,
  wager_id   uuid not null references public.wagers(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index messages_wager_idx on public.messages (wager_id);

create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  msg        text not null,
  sub        text,
  amt        int,
  actor_id   uuid references public.profiles(id),
  wager_id   uuid references public.wagers(id),
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.sms_outbox (
  id         bigserial primary key,
  to_phone   text not null,
  body       text not null,             -- "{link}" is replaced with the app URL when sent
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);

create table public.sync_state (
  key   text primary key,
  value timestamptz not null
);

-- ─── Helpers ─────────────────────────────────────────────────────────
create or replace function public.is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = uid), false);
$$;

create or replace function public.are_friends(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where a = least(x,y) and b = greatest(x,y));
$$;

create or replace function public.balance_of(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from ledger where user_id = uid;
$$;

create or replace function public.first_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(name, ' ', 1), ''), 'Someone') from profiles where id = uid;
$$;

create or replace function public.short_team(t text) returns text
language sql immutable as $$
  select regexp_replace(t, '^.* ', '');
$$;

-- Human label for one side of a wager, e.g. "Bucks -2.5" / "Warriors +2.5" / "Bucks PK"
create or replace function public.side_label(g games, fav text, sp numeric, s text) returns text
language sql stable as $$
  select case
    when s = 'fav' then short_team(fav) || ' ' || case when sp = 0 then 'PK' else trim(to_char(sp, 'FM990.0')) end
    else short_team(case when fav = g.home then g.away else g.home end) || ' ' ||
         case when sp = 0 then 'PK' else '+' || trim(to_char(abs(sp), 'FM990.0')) end
  end;
$$;

-- In-app notification + optional text message
create or replace function public.notify(
  p_user uuid, p_type text, p_msg text, p_sub text default null, p_amt int default null,
  p_actor uuid default null, p_wager uuid default null, p_sms text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_phone text; v_alerts boolean;
begin
  insert into notifications (user_id, type, msg, sub, amt, actor_id, wager_id)
  values (p_user, p_type, p_msg, p_sub, p_amt, p_actor, p_wager);
  if p_sms is not null then
    select phone, sms_alerts into v_phone, v_alerts from profiles where id = p_user;
    if v_phone is not null and v_alerts then
      insert into sms_outbox (to_phone, body) values (v_phone, p_sms);
    end if;
  end if;
end $$;

create or replace function public.notify_admins(p_type text, p_msg text, p_sub text, p_amt int, p_actor uuid, p_sms text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from profiles where is_admin and id is distinct from p_actor loop
    perform notify(r.id, p_type, p_msg, p_sub, p_amt, p_actor, null, p_sms);
  end loop;
end $$;

-- Serialize all money moves for a user (prevents double-spend from two taps)
create or replace function public.lock_user(uid uuid) returns void
language sql security definer set search_path = public as $$
  select 1 from profiles where id = uid for update;
$$;

-- ─── New user → profile (first user ever becomes the admin/bank) ────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone, is_admin)
  values (new.id, nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), ''),
          not exists (select 1 from profiles));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════
-- Wager lifecycle
-- ════════════════════════════════════════════════════════════════════

create or replace function public.send_wager(
  p_game_id text, p_side text, p_amount int, p_message text default null, p_to uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); g games; v_id uuid; v_label text; v_other text; r record;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_side not in ('fav','dog') then raise exception 'Pick a side'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Enter a wager amount'; end if;

  select * into g from games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  if g.status <> 'upcoming' or g.commence_time <= now() then raise exception 'This game has already started'; end if;
  if g.spread is null or g.fav_team is null then raise exception 'No line available for this game yet'; end if;

  if p_to is not null then
    if p_to = me then raise exception 'You can''t bet yourself'; end if;
    if not are_friends(me, p_to) then raise exception 'You can only challenge people in your crew'; end if;
  end if;

  perform lock_user(me);
  if balance_of(me) < p_amount then raise exception 'Not enough BuddyBucks (available: $%)', balance_of(me); end if;

  insert into wagers (game_id, from_user, to_user, side, fav_team, spread, amount, message)
  values (p_game_id, me, p_to, p_side, g.fav_team, g.spread, p_amount, nullif(trim(p_message), ''))
  returning id into v_id;

  insert into ledger (user_id, amount, kind, wager_id, memo)
  values (me, -p_amount, 'stake', v_id, 'Bet · ' || short_team(g.away) || ' @ ' || short_team(g.home));

  v_label := side_label(g, g.fav_team, g.spread, p_side);
  v_other := side_label(g, g.fav_team, g.spread, case when p_side = 'fav' then 'dog' else 'fav' end);

  if p_to is not null then
    perform notify(p_to, 'BET_RECEIVED', first_name(me) || ' challenged you — $' || p_amount,
      'You''d get ' || v_other || ' · ' || short_team(g.away) || ' @ ' || short_team(g.home), p_amount, me, v_id,
      '🎯 BetBuddy: ' || first_name(me) || ' challenged you to $' || p_amount || '. You get ' || v_other ||
      ' (' || short_team(g.away) || ' @ ' || short_team(g.home) || '). Accept or decline: {link}');
  else
    for r in select case when a = me then b else a end as fid from friendships where a = me or b = me loop
      perform notify(r.fid, 'FIELD_MATCHED', first_name(me) || ' posted an open bet — $' || p_amount,
        'Take ' || v_other || ' · first to accept locks it', p_amount, me, v_id, null);
    end loop;
  end if;
  return v_id;
end $$;

create or replace function public.accept_wager(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w wagers; g games;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into w from wagers where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'This challenge is no longer open'; end if;
  if w.from_user = me then raise exception 'You can''t accept your own challenge'; end if;
  if w.to_user is null then
    if not are_friends(me, w.from_user) then raise exception 'Not in this crew'; end if;
  elsif w.to_user <> me then
    raise exception 'This challenge isn''t for you';
  end if;

  select * into g from games where id = w.game_id;
  if g.status <> 'upcoming' or g.commence_time <= now() then raise exception 'Too late — the game has started'; end if;

  perform lock_user(me);
  if balance_of(me) < w.amount then raise exception 'Not enough BuddyBucks (need $%)', w.amount; end if;

  insert into ledger (user_id, amount, kind, wager_id, memo) values (me, -w.amount, 'stake', w.id, 'Bet vs ' || first_name(w.from_user) || ' · ' || short_team(g.away) || ' @ ' || short_team(g.home));
  update wagers set status = 'locked', to_user = me, accepted_at = now() where id = w.id;

  perform notify(w.from_user, 'BET_ACCEPTED', first_name(me) || ' accepted — $' || w.amount || ' locked 🔒',
    side_label(g, w.fav_team, w.spread, w.side) || ' · ' || short_team(g.away) || ' @ ' || short_team(g.home), w.amount, me, w.id,
    '✅ BetBuddy: ' || first_name(me) || ' accepted your $' || w.amount || ' bet on ' ||
    short_team(g.away) || ' @ ' || short_team(g.home) || '. It''s locked in. {link}');
end $$;

create or replace function public.decline_wager(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w wagers;
begin
  select * into w from wagers where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'This challenge is no longer open'; end if;
  if w.to_user is distinct from me then raise exception 'This challenge isn''t for you'; end if;
  update wagers set status = 'declined' where id = w.id;
  insert into ledger (user_id, amount, kind, wager_id, memo) values (w.from_user, w.amount, 'stake_refund', w.id, 'Challenge declined');
  perform notify(w.from_user, 'BET_DECLINED', first_name(me) || ' declined your challenge',
    '$' || w.amount || ' returned to your balance', w.amount, me, w.id, null);
end $$;

create or replace function public.cancel_wager(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w wagers;
begin
  select * into w from wagers where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'This challenge is no longer open'; end if;
  if w.from_user <> me then raise exception 'Not your challenge'; end if;
  update wagers set status = 'cancelled' where id = w.id;
  insert into ledger (user_id, amount, kind, wager_id, memo) values (me, w.amount, 'stake_refund', w.id, 'Challenge cancelled');
end $$;

-- Recipient proposes a different amount: original is declined (sender refunded)
-- and a new challenge goes back the other way on the opposite side, same line.
create or replace function public.counter_wager(p_id uuid, p_amount int) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w wagers; g games; v_id uuid;
begin
  if p_amount is null or p_amount < 1 then raise exception 'Enter a counter amount'; end if;
  select * into w from wagers where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'This challenge is no longer open'; end if;
  if w.to_user is distinct from me then raise exception 'This challenge isn''t for you'; end if;
  select * into g from games where id = w.game_id;
  if g.status <> 'upcoming' or g.commence_time <= now() then raise exception 'Too late — the game has started'; end if;

  perform lock_user(me);
  if balance_of(me) < p_amount then raise exception 'Not enough BuddyBucks (available: $%)', balance_of(me); end if;

  update wagers set status = 'declined' where id = w.id;
  insert into ledger (user_id, amount, kind, wager_id, memo) values (w.from_user, w.amount, 'stake_refund', w.id, 'Countered');

  insert into wagers (game_id, from_user, to_user, side, fav_team, spread, amount, countered_from)
  values (w.game_id, me, w.from_user, case when w.side = 'fav' then 'dog' else 'fav' end, w.fav_team, w.spread, p_amount, w.id)
  returning id into v_id;
  insert into ledger (user_id, amount, kind, wager_id, memo) values (me, -p_amount, 'stake', v_id, 'Counter sent');

  perform notify(w.from_user, 'BET_COUNTER', first_name(me) || ' countered: $' || p_amount || ' instead of $' || w.amount,
    'Your $' || w.amount || ' was refunded · same line, your call', p_amount, me, v_id,
    '🔄 BetBuddy: ' || first_name(me) || ' countered your bet at $' || p_amount || '. Accept or decline: {link}');
  return v_id;
end $$;

-- Sender opens a pending direct challenge up to anyone in their crew
create or replace function public.send_to_field(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w wagers; g games; r record;
begin
  select * into w from wagers where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'This challenge is no longer open'; end if;
  if w.from_user <> me then raise exception 'Not your challenge'; end if;
  update wagers set to_user = null where id = w.id;
  select * into g from games where id = w.game_id;
  for r in select case when a = me then b else a end as fid from friendships where a = me or b = me loop
    perform notify(r.fid, 'FIELD_MATCHED', first_name(me) || ' posted an open bet — $' || w.amount,
      'Take ' || side_label(g, w.fav_team, w.spread, case when w.side='fav' then 'dog' else 'fav' end) || ' · first to accept locks it',
      w.amount, me, w.id, null);
  end loop;
end $$;

-- Pending challenges on games that have started get refunded
create or replace function public.expire_started() returns int
language plpgsql security definer set search_path = public as $$
declare w record; n int := 0;
begin
  for w in select wg.* from wagers wg join games g on g.id = wg.game_id
           where wg.status = 'pending' and g.commence_time <= now() for update of wg loop
    update wagers set status = 'expired' where id = w.id;
    insert into ledger (user_id, amount, kind, wager_id, memo) values (w.from_user, w.amount, 'stake_refund', w.id, 'Expired — game started');
    perform notify(w.from_user, 'WAGER_CANCELLED', 'Challenge expired — game started', '$' || w.amount || ' returned to your balance', w.amount, w.to_user, w.id, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Grade every locked wager on a finished game.
create or replace function public.settle_game(p_game_id text) returns int
language plpgsql security definer set search_path = public as $$
declare g games; w record; fav_score int; dog_score int; margin numeric; v_result text; v_winner uuid; v_loser uuid; n int := 0;
begin
  select * into g from games where id = p_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if g.status <> 'final' or g.home_score is null or g.away_score is null then raise exception 'Game is not final'; end if;

  perform expire_started();

  for w in select * from wagers where game_id = g.id and status = 'locked' for update loop
    if w.fav_team = g.home then fav_score := g.home_score; dog_score := g.away_score;
    else fav_score := g.away_score; dog_score := g.home_score; end if;
    margin := (fav_score - dog_score) + w.spread;          -- spread is <= 0
    v_result := case when margin > 0 then 'fav' when margin < 0 then 'dog' else 'push' end;

    if v_result = 'push' then
      update wagers set status = 'settled', winner = null, settled_at = now() where id = w.id;
      insert into ledger (user_id, amount, kind, wager_id, memo) values
        (w.from_user, w.amount, 'stake_refund', w.id, 'Push'),
        (w.to_user,   w.amount, 'stake_refund', w.id, 'Push');
      perform notify(w.from_user, 'AUTO_SETTLE', 'Push — $' || w.amount || ' refunded', short_team(g.away) || ' ' || g.away_score || ', ' || short_team(g.home) || ' ' || g.home_score, w.amount, w.to_user, w.id, null);
      perform notify(w.to_user,   'AUTO_SETTLE', 'Push — $' || w.amount || ' refunded', short_team(g.away) || ' ' || g.away_score || ', ' || short_team(g.home) || ' ' || g.home_score, w.amount, w.from_user, w.id, null);
    else
      v_winner := case when w.side = v_result then w.from_user else w.to_user end;
      v_loser  := case when v_winner = w.from_user then w.to_user else w.from_user end;
      update wagers set status = 'settled', winner = v_winner, settled_at = now() where id = w.id;
      insert into ledger (user_id, amount, kind, wager_id, memo) values (v_winner, w.amount * 2, 'payout', w.id, 'Won vs ' || first_name(v_loser));
      perform notify(v_winner, 'BET_SETTLED_W', 'You beat ' || first_name(v_loser) || ' — +$' || w.amount || ' 🏆',
        'Final: ' || short_team(g.away) || ' ' || g.away_score || ', ' || short_team(g.home) || ' ' || g.home_score, w.amount, v_loser, w.id,
        '🏆 BetBuddy: You beat ' || first_name(v_loser) || '! $' || (w.amount * 2) || ' added to your balance. {link}');
      perform notify(v_loser, 'BET_SETTLED_L', first_name(v_winner) || ' won the $' || w.amount || ' bet',
        'Final: ' || short_team(g.away) || ' ' || g.away_score || ', ' || short_team(g.home) || ' ' || g.home_score, w.amount, v_winner, w.id, null);
    end if;
    n := n + 1;
  end loop;

  update games set settled = true where id = g.id;
  return n;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- Wallet: deposits & cash-outs
-- ════════════════════════════════════════════════════════════════════

create or replace function public.request_deposit(p_amount int) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid; v_code text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then raise exception 'Enter an amount between $1 and $10,000'; end if;
  select deposit_code into v_code from profiles where id = me;
  insert into deposit_requests (user_id, amount, code) values (me, p_amount, v_code) returning id into v_id;
  perform notify_admins('DEPOSIT', first_name(me) || ' says they sent $' || p_amount, 'Venmo note: ' || v_code || ' · approve in Admin', p_amount, me,
    '💰 BetBuddy: ' || first_name(me) || ' says they Venmo''d you $' || p_amount || ' (note ' || v_code || '). Approve: {link}');
  return v_id;
end $$;

create or replace function public.request_withdrawal(p_amount int, p_venmo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid; v_venmo text := nullif(trim(both ' @' from coalesce(p_venmo, '')), '');
begin
  if me is null then raise exception 'Not signed in'; end if;
  if v_venmo is null then raise exception 'Add your Venmo username'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Enter an amount'; end if;
  perform lock_user(me);
  if balance_of(me) < p_amount then raise exception 'You only have $% available', balance_of(me); end if;
  insert into withdrawal_requests (user_id, amount, venmo) values (me, p_amount, v_venmo) returning id into v_id;
  insert into ledger (user_id, amount, kind, ref_id, memo) values (me, -p_amount, 'withdrawal', v_id, 'Cash out to @' || v_venmo);
  update profiles set venmo = v_venmo where id = me;
  perform notify_admins('DEPOSIT', first_name(me) || ' requested a $' || p_amount || ' cash out', 'Pay @' || v_venmo || ' on Venmo', p_amount, me,
    '💸 BetBuddy: ' || first_name(me) || ' requested a $' || p_amount || ' cash out to @' || v_venmo || '. {link}');
  return v_id;
end $$;

create or replace function public.admin_resolve_deposit(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d deposit_requests;
begin
  if not is_admin(me) then raise exception 'Admins only'; end if;
  select * into d from deposit_requests where id = p_id for update;
  if not found or d.status <> 'pending' then raise exception 'Already handled'; end if;
  update deposit_requests set status = case when p_approve then 'approved' else 'rejected' end, resolved_at = now(), resolved_by = me where id = d.id;
  if p_approve then
    insert into ledger (user_id, amount, kind, ref_id, memo) values (d.user_id, d.amount, 'deposit', d.id, 'Venmo deposit');
    perform notify(d.user_id, 'DEPOSIT', '$' || d.amount || ' added to your balance', 'Deposit approved — go get ''em', d.amount, null, null,
      '💰 BetBuddy: Your $' || d.amount || ' deposit is in. {link}');
  else
    perform notify(d.user_id, 'LOW_BALANCE', 'Deposit of $' || d.amount || ' couldn''t be matched', 'Check that your Venmo note included ' || d.code, d.amount, null, null, null);
  end if;
end $$;

create or replace function public.admin_resolve_withdrawal(p_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); x withdrawal_requests;
begin
  if not is_admin(me) then raise exception 'Admins only'; end if;
  select * into x from withdrawal_requests where id = p_id for update;
  if not found or x.status <> 'pending' then raise exception 'Already handled'; end if;
  update withdrawal_requests set status = case when p_paid then 'paid' else 'rejected' end, resolved_at = now(), resolved_by = me where id = x.id;
  if p_paid then
    perform notify(x.user_id, 'DEPOSIT', 'Cash out sent — $' || x.amount, 'Paid to @' || x.venmo || ' on Venmo', x.amount, null, null,
      '💸 BetBuddy: Your $' || x.amount || ' cash out was sent to @' || x.venmo || ' on Venmo.');
  else
    insert into ledger (user_id, amount, kind, ref_id, memo) values (x.user_id, x.amount, 'withdrawal_refund', x.id, 'Cash out cancelled');
    perform notify(x.user_id, 'WAGER_CANCELLED', 'Cash out cancelled', '$' || x.amount || ' returned to your balance', x.amount, null, null, null);
  end if;
end $$;

create or replace function public.admin_adjust(p_user uuid, p_amount int, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  insert into ledger (user_id, amount, kind, memo) values (p_user, p_amount, 'adjustment', coalesce(nullif(trim(p_memo), ''), 'Adjustment'));
  perform notify(p_user, 'DEPOSIT', 'Balance adjusted ' || case when p_amount > 0 then '+' else '-' end || '$' || abs(p_amount), p_memo, abs(p_amount), null, null, null);
end $$;

-- Refund both sides of a locked bet (postponed game, disputes, etc.)
create or replace function public.admin_void_wager(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w wagers;
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  select * into w from wagers where id = p_id for update;
  if not found or w.status not in ('locked','pending') then raise exception 'Only open or locked bets can be voided'; end if;
  update wagers set status = 'void', settled_at = now() where id = w.id;
  insert into ledger (user_id, amount, kind, wager_id, memo) values (w.from_user, w.amount, 'stake_refund', w.id, 'Voided');
  perform notify(w.from_user, 'WAGER_CANCELLED', 'Bet voided — $' || w.amount || ' refunded', null, w.amount, null, w.id, null);
  if w.status = 'locked' then
    insert into ledger (user_id, amount, kind, wager_id, memo) values (w.to_user, w.amount, 'stake_refund', w.id, 'Voided');
    perform notify(w.to_user, 'WAGER_CANCELLED', 'Bet voided — $' || w.amount || ' refunded', null, w.amount, null, w.id, null);
  end if;
end $$;

-- Manual final score when the data feed misses a game
create or replace function public.admin_final_score(p_game_id text, p_home int, p_away int) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  update games set status = 'final', home_score = p_home, away_score = p_away, updated_at = now() where id = p_game_id and not settled;
  if not found then raise exception 'Game not found or already settled'; end if;
  return settle_game(p_game_id);
end $$;

-- Totals the bank needs to hold (everyone's money in the system)
create or replace function public.admin_summary() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  return json_build_object(
    'available', (select coalesce(sum(amount),0) from ledger),
    'in_bets', (select coalesce(sum(amount * case when status = 'locked' then 2 else 1 end),0) from wagers where status in ('pending','locked')),
    'owed_cashouts', (select coalesce(sum(amount),0) from withdrawal_requests where status = 'pending'),
    'deposited', (select coalesce(sum(amount),0) from ledger where kind = 'deposit'),
    'paid_out', (select coalesce(sum(amount),0) from withdrawal_requests where status = 'paid'),
    'users', (select count(*) from profiles)
  );
end $$;

create or replace function public.admin_users() returns table (id uuid, name text, phone text, color text, photo_url text, venmo text, available int, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  return query select p.id, p.name, p.phone, p.color, p.photo_url, p.venmo, balance_of(p.id), p.is_admin from profiles p order by p.name;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- Wallet summary, crew, invites
-- ════════════════════════════════════════════════════════════════════

create or replace function public.my_wallet() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'available', balance_of(auth.uid()),
    'locked',  (select coalesce(sum(amount),0) from wagers where status = 'locked' and (from_user = auth.uid() or to_user = auth.uid())),
    'pending', (select coalesce(sum(amount),0) from wagers where status = 'pending' and from_user = auth.uid()),
    'cashing_out', (select coalesce(sum(amount),0) from withdrawal_requests where status = 'pending' and user_id = auth.uid())
  );
$$;

create or replace function public.befriend(x uuid, y uuid) returns void
language sql security definer set search_path = public as $$
  insert into friendships (a, b) values (least(x,y), greatest(x,y)) on conflict do nothing;
$$;

-- Called after sign-up when the person opened an invite link
create or replace function public.join_via_invite(p_inviter uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_inviter is null or p_inviter = me then return; end if;
  if not exists (select 1 from profiles where id = p_inviter) then return; end if;
  if are_friends(me, p_inviter) then return; end if;
  perform befriend(me, p_inviter);
  perform notify(p_inviter, 'BUDDY_UP', coalesce(nullif(first_name(me), 'Someone'), 'A new buddy') || ' joined your crew 👊', 'Challenge them from the Games tab', null, me, null, null);
end $$;

create or replace function public.add_friend_by_phone(p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g'); v_id uuid;
begin
  if length(d) = 10 then d := '1' || d; end if;
  select id into v_id from profiles where phone = d;
  if v_id is null then return null; end if;          -- not on BetBuddy yet → app offers an invite text
  if v_id = me then raise exception 'That''s your number'; end if;
  if not are_friends(me, v_id) then
    perform befriend(me, v_id);
    perform notify(v_id, 'BUDDY_UP', first_name(me) || ' added you to their crew 👊', 'You can now challenge each other', null, me, null, null);
  end if;
  return v_id;
end $$;

-- How many bets exist on each upcoming game (drives the HOT tag). Counts only.
create or replace function public.game_bet_counts() returns table (game_id text, n int)
language sql stable security definer set search_path = public as $$
  select wg.game_id, count(*)::int from wagers wg join games g on g.id = wg.game_id
  where g.commence_time > now() - interval '12 hours' and wg.status in ('pending','locked','settled')
  group by wg.game_id;
$$;


-- Text-message queue: the server job claims rows atomically so a text is never sent twice
create or replace function public.claim_sms(p_limit int default 20)
returns table (id bigint, to_phone text, body text)
language sql security definer set search_path = public as $$
  update sms_outbox s set sent_at = now()
  where s.id in (select o.id from sms_outbox o where o.sent_at is null and o.created_at > now() - interval '1 hour'
                 order by o.id limit p_limit for update skip locked)
  returning s.id, s.to_phone, s.body;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Row-level security: clients can read what's theirs; all writes that
-- touch money go through the functions above.
-- ════════════════════════════════════════════════════════════════════
alter table profiles            enable row level security;
alter table friendships         enable row level security;
alter table games               enable row level security;
alter table wagers              enable row level security;
alter table ledger              enable row level security;
alter table deposit_requests    enable row level security;
alter table withdrawal_requests enable row level security;
alter table messages            enable row level security;
alter table notifications       enable row level security;
alter table sms_outbox          enable row level security;
alter table sync_state          enable row level security;

create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or are_friends(id, auth.uid()) or is_admin(auth.uid()));
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy friendships_read on friendships for select to authenticated
  using (a = auth.uid() or b = auth.uid());

create policy games_read on games for select to authenticated using (true);

create policy wagers_read on wagers for select to authenticated using (
  from_user = auth.uid() or to_user = auth.uid()
  or (to_user is null and status = 'pending' and are_friends(from_user, auth.uid()))
  or is_admin(auth.uid())
);

create policy ledger_read on ledger for select to authenticated using (user_id = auth.uid() or is_admin(auth.uid()));
create policy deposits_read on deposit_requests for select to authenticated using (user_id = auth.uid() or is_admin(auth.uid()));
create policy withdrawals_read on withdrawal_requests for select to authenticated using (user_id = auth.uid() or is_admin(auth.uid()));

create policy messages_read on messages for select to authenticated using (
  exists (select 1 from wagers w where w.id = wager_id and (w.from_user = auth.uid() or w.to_user = auth.uid()))
);
create policy messages_write on messages for insert to authenticated with check (
  user_id = auth.uid() and
  exists (select 1 from wagers w where w.id = wager_id and (w.from_user = auth.uid() or w.to_user = auth.uid()))
);

create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated using (user_id = auth.uid());
create policy notifications_delete on notifications for delete to authenticated using (user_id = auth.uid());

-- Column-level grants: people can edit their own display info, never is_admin/phone/deposit_code
revoke all on all tables in schema public from anon, authenticated;
grant select on profiles, friendships, games, wagers, ledger, deposit_requests, withdrawal_requests, messages, notifications to authenticated;
grant update (name, color, photo_url, venmo, sms_alerts) on profiles to authenticated;
grant insert (wager_id, user_id, body) on messages to authenticated;
grant usage on sequence messages_id_seq to authenticated;
grant update (read) on notifications to authenticated;
grant delete on notifications to authenticated;

-- Functions: internal helpers are not callable from the app
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  send_wager(text, text, int, text, uuid), accept_wager(uuid), decline_wager(uuid), cancel_wager(uuid),
  counter_wager(uuid, int), send_to_field(uuid), request_deposit(int), request_withdrawal(int, text),
  admin_resolve_deposit(uuid, boolean), admin_resolve_withdrawal(uuid, boolean), admin_adjust(uuid, int, text),
  admin_void_wager(uuid), admin_final_score(text, int, int), admin_summary(), admin_users(),
  my_wallet(), join_via_invite(uuid), add_friend_by_phone(text), game_bet_counts(),
  is_admin(uuid), are_friends(uuid, uuid)
to authenticated;
-- Server-side (service role) jobs
grant execute on function expire_started(), settle_game(text), claim_sms(int) to service_role;

-- Live updates in the app
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table wagers, notifications, messages, games;
  end if;
end $$;

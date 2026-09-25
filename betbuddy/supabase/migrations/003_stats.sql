-- ════════════════════════════════════════════════════════════════════
-- BetBuddy — admin dashboard stats (run after 002_push.sql)
-- Tracks app opens per person per day and serves one admin-only summary.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists last_seen timestamptz;

create table if not exists public.app_opens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  opens   int  not null default 1,
  primary key (user_id, day)
);
alter table app_opens enable row level security;
revoke all on app_opens from anon, authenticated;
grant all on app_opens to service_role;

-- Called once each time someone opens the app
create or replace function public.touch() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d date := (now() at time zone 'America/New_York')::date;
begin
  if me is null then return; end if;
  insert into app_opens (user_id, day) values (me, d)
  on conflict (user_id, day) do update set opens = app_opens.opens + 1;
  update profiles set last_seen = now() where id = me;
end $$;

create or replace function public.admin_stats(p_days int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := 'America/New_York';
  today date := (now() at time zone tz)::date;
  start date := today - (greatest(p_days, 7) - 1);
begin
  if not is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  return json_build_object(
    'days', p_days,
    'users', json_build_object(
      'total',        (select count(*) from profiles where name <> ''),
      'new_7d',       (select count(*) from profiles where name <> '' and created_at >= now() - interval '7 days'),
      'active_today', (select count(*) from app_opens where day = today),
      'active_7d',    (select count(distinct user_id) from app_opens where day > today - 7),
      'opens_7d',     (select coalesce(sum(opens),0) from app_opens where day > today - 7),
      'push_on',      (select count(distinct user_id) from push_subscriptions),
      'funded',       (select count(*) from (select user_id from ledger where kind = 'deposit' group by user_id) x)
    ),
    'bets', (
      select json_build_object(
        'accepted',   count(*) filter (where status in ('locked','settled')),
        'settled',    count(*) filter (where status = 'settled'),
        'open',       count(*) filter (where status = 'locked'),
        'pending',    count(*) filter (where status = 'pending'),
        'sent',       count(*),
        'declined',   count(*) filter (where status = 'declined'),
        'expired',    count(*) filter (where status in ('expired','cancelled')),
        'handle',     coalesce(sum(amount * 2) filter (where status in ('locked','settled')), 0),
        'avg_stake',  coalesce(round(avg(amount) filter (where status in ('locked','settled'))), 0),
        'handle_7d',  coalesce(sum(amount * 2) filter (where status in ('locked','settled') and accepted_at >= now() - interval '7 days'), 0),
        'bets_7d',    count(*) filter (where status in ('locked','settled') and accepted_at >= now() - interval '7 days')
      ) from wagers
    ),
    'biggest', (
      select json_build_object('amount', w.amount, 'from', pf.name, 'to', pt.name, 'away', g.away, 'home', g.home, 'status', w.status, 'winner', pw.name)
      from wagers w join profiles pf on pf.id = w.from_user join profiles pt on pt.id = w.to_user
      join games g on g.id = w.game_id left join profiles pw on pw.id = w.winner
      where w.status in ('locked','settled') order by w.amount desc, w.accepted_at desc limit 1
    ),
    'signups_by_day', (
      select json_agg(json_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
      from generate_series(start, today, interval '1 day') d
      left join (select (created_at at time zone tz)::date dd, count(*) n from profiles where name <> '' group by 1) c on c.dd = d::date
    ),
    'active_by_day', (
      select json_agg(json_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
      from generate_series(start, today, interval '1 day') d
      left join (select day dd, count(*) n from app_opens group by 1) c on c.dd = d::date
    ),
    'bets_by_day', (
      select json_agg(json_build_object('day', d::date, 'n', coalesce(c.n, 0), 'volume', coalesce(c.v, 0)) order by d)
      from generate_series(start, today, interval '1 day') d
      left join (select (accepted_at at time zone tz)::date dd, count(*) n, sum(amount * 2) v
                 from wagers where status in ('locked','settled') group by 1) c on c.dd = d::date
    ),
    'top_games', (
      select coalesce(json_agg(t), '[]'::json) from (
        select g.sport, g.away, g.home, g.commence_time, count(*) bets, sum(w.amount * 2) volume
        from wagers w join games g on g.id = w.game_id
        where w.status in ('locked','settled')
        group by g.id, g.sport, g.away, g.home, g.commence_time
        order by count(*) desc, sum(w.amount) desc limit 8
      ) t
    ),
    'by_sport', (
      select coalesce(json_agg(t), '[]'::json) from (
        select g.sport, count(*) bets, sum(w.amount * 2) volume
        from wagers w join games g on g.id = w.game_id
        where w.status in ('locked','settled') group by g.sport order by sum(w.amount) desc
      ) t
    ),
    'leaderboard', (
      select coalesce(json_agg(t), '[]'::json) from (
        select p.id, p.name, p.color, p.photo_url,
          count(w.*) bets,
          count(w.*) filter (where w.status = 'settled' and w.winner = p.id) wins,
          count(w.*) filter (where w.status = 'settled' and w.winner is not null and w.winner <> p.id) losses,
          count(w.*) filter (where w.status = 'settled' and w.winner is null) pushes,
          coalesce(sum(case when w.status <> 'settled' or w.winner is null then 0 when w.winner = p.id then w.amount else -w.amount end), 0) net,
          coalesce(sum(w.amount), 0) wagered,
          p.last_seen
        from profiles p
        left join wagers w on (w.from_user = p.id or w.to_user = p.id) and w.status in ('locked','settled')
        where p.name <> ''
        group by p.id, p.name, p.color, p.photo_url, p.last_seen order by count(w.*) desc, p.name
      ) t
    )
  );
end $$;

revoke execute on function touch(), admin_stats(int) from public, anon, authenticated;
grant execute on function touch(), admin_stats(int) to authenticated;

-- Bank summary now also reports manual ± adjustments (so the numbers always reconcile)
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
    'adjusted', (select coalesce(sum(amount),0) from ledger where kind = 'adjustment'),
    'users', (select count(*) from profiles)
  );
end $$;

-- ── The Field is OFF: every bet must name the buddy it's against ──────
-- (To turn it back on later: insert into app_config values ('field_enabled','true');)
create or replace function public.block_field_bets() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.to_user is null and new.status = 'pending'
     and coalesce((select value from app_config where key = 'field_enabled'), 'false') <> 'true' then
    raise exception 'Open bets are turned off. Pick a buddy to challenge.';
  end if;
  return new;
end $$;
drop trigger if exists wagers_no_field on public.wagers;
create trigger wagers_no_field before insert or update of to_user on public.wagers
  for each row execute function public.block_field_bets();
revoke execute on function block_field_bets() from public, anon, authenticated;

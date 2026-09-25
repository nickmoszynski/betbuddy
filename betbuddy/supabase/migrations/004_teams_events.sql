-- ════════════════════════════════════════════════════════════════════
-- BetBuddy — team logos/rankings + head-to-head events (Golf, F1)
-- Run after 003_stats.sql. Safe to run more than once. Changes no balances.
-- ════════════════════════════════════════════════════════════════════

-- Team directory (names, logos, colors, AP rank) refreshed daily from ESPN
create table if not exists public.teams (
  league     text not null,            -- nfl | nba | college-football | mens-college-basketball
  name_key   text not null,            -- normalized full name, e.g. "ohiostatebuckeyes"
  full_name  text not null,            -- "Ohio State Buckeyes"
  short_name text not null,            -- "Buckeyes" for pros, "Ohio State" for colleges
  abbr       text,
  color      text,
  alt_color  text,
  logo       text,
  rank       int,                      -- AP Top 25 rank (colleges), null if unranked
  updated_at timestamptz not null default now(),
  primary key (league, name_key)
);
alter table teams enable row level security;
drop policy if exists teams_read on teams;
create policy teams_read on teams for select to authenticated using (true);
grant select on teams to authenticated;
grant all on teams to service_role;

-- Games can now also be head-to-head matchups ("kind = h2h"): away = player A, home = player B,
-- pick'em (spread 0). ext holds the source market info (Kalshi tickers + prices).
alter table public.games add column if not exists kind  text not null default 'game';
alter table public.games add column if not exists title text;
alter table public.games add column if not exists ext   jsonb;

create or replace function public.norm_name(t text) returns text
language sql immutable as $$
  select regexp_replace(lower(translate(coalesce(t,''), 'áàâäãéèêëíìîïóòôöõúùûüñçÁÉÍÓÚÑ', 'aaaaaeeeeiiiiooooouuuuncAEIOUN')), '[^a-z0-9]', '', 'g');
$$;

-- Short display name: college → school ("Ohio State"), pro → nickname ("Bills"), person → last name
create or replace function public.short_team(t text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select short_name from teams where name_key = norm_name(t) limit 1),
    regexp_replace(regexp_replace(t, '\s+(Jr\.?|Sr\.?|II|III|IV)$', ''), '^.* ', '')
  );
$$;

create or replace function public.side_label(g games, fav text, sp numeric, s text) returns text
language sql stable as $$
  select case
    when g.kind = 'h2h' then short_team(case when s = 'fav' then fav else (case when fav = g.home then g.away else g.home end) end)
    when s = 'fav' then short_team(fav) || ' ' || case when sp = 0 then 'PK' else trim(to_char(sp, 'FM990.0')) end
    else short_team(case when fav = g.home then g.away else g.home end) || ' ' ||
         case when sp = 0 then 'PK' else '+' || trim(to_char(abs(sp), 'FM990.0')) end
  end;
$$;


-- One-line result for notifications: "Final: Dolphins 20, Bills 27" or "Glover beat Dunlap"
create or replace function public.result_line(g games) returns text
language sql stable as $$
  select case
    when g.kind = 'h2h' then case
      when g.away_score > g.home_score then short_team(g.away) || ' beat ' || short_team(g.home)
      when g.home_score > g.away_score then short_team(g.home) || ' beat ' || short_team(g.away)
      else short_team(g.away) || ' & ' || short_team(g.home) || ' tied' end
    else 'Final: ' || short_team(g.away) || ' ' || g.away_score || ', ' || short_team(g.home) || ' ' || g.home_score
  end;
$$;

-- Grade every locked wager on a finished game (now uses result_line for the message)
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
      perform notify(w.from_user, 'AUTO_SETTLE', 'Push — $' || w.amount || ' refunded', result_line(g), w.amount, w.to_user, w.id, null);
      perform notify(w.to_user,   'AUTO_SETTLE', 'Push — $' || w.amount || ' refunded', result_line(g), w.amount, w.from_user, w.id, null);
    else
      v_winner := case when w.side = v_result then w.from_user else w.to_user end;
      v_loser  := case when v_winner = w.from_user then w.to_user else w.from_user end;
      update wagers set status = 'settled', winner = v_winner, settled_at = now() where id = w.id;
      insert into ledger (user_id, amount, kind, wager_id, memo) values (v_winner, w.amount * 2, 'payout', w.id, 'Won vs ' || first_name(v_loser));
      perform notify(v_winner, 'BET_SETTLED_W', 'You beat ' || first_name(v_loser) || ' — +$' || w.amount || ' 🏆',
        result_line(g), w.amount, v_loser, w.id,
        '🏆 BetBuddy: You beat ' || first_name(v_loser) || '! $' || (w.amount * 2) || ' added to your balance. {link}');
      perform notify(v_loser, 'BET_SETTLED_L', first_name(v_winner) || ' won the $' || w.amount || ' bet',
        result_line(g), w.amount, v_winner, w.id, null);
    end if;
    n := n + 1;
  end loop;

  update games set settled = true where id = g.id;
  return n;
end $$;
revoke execute on function settle_game(text), result_line(games), short_team(text), norm_name(text) from public, anon, authenticated;
grant execute on function settle_game(text) to service_role;

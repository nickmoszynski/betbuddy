-- Team names/ranks + head-to-head (golf) events
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
insert into teams (league, name_key, full_name, short_name, abbr, rank) values
  ('college-football', norm_name('Ohio State Buckeyes'), 'Ohio State Buckeyes', 'Ohio State', 'OSU', 3),
  ('college-football', norm_name('San José State Spartans'), 'San José State Spartans', 'San José State', 'SJSU', null)
on conflict do nothing;
do $$ begin
  assert short_team('Ohio State Buckeyes') = 'Ohio State', short_team('Ohio State Buckeyes');
  assert short_team('San Jose State Spartans') = 'San José State', 'accent-insensitive: ' || short_team('San Jose State Spartans');
  assert short_team('Buffalo Bills') = 'Bills', 'fallback last word';
  assert short_team('Carlos Sainz Jr.') = 'Sainz', 'suffix: ' || short_team('Carlos Sainz Jr.');
end $$;
insert into games (id, sport, sport_key, home, away, commence_time, fav_team, spread, kind, title)
values ('KXPGAH2H-TEST', 'GOLF', 'kalshi:KXPGAH2H', 'Lucas Glover', 'Nick Dunlap', now() + interval '1 day', 'Nick Dunlap', 0, 'h2h', 'Round 4 · Biltmore Championship');
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Mo'), false);
select send_wager('KXPGAH2H-TEST', 'dog', 10, null, (select id from u where name = 'Dad'));  -- Mo takes Glover
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Dad'), false);
do $$ begin
  assert (select msg from notifications where type = 'BET_RECEIVED' order by id desc limit 1) like 'Mo challenged you%', 'challenge note';
  assert (select sub from notifications where type = 'BET_RECEIVED' order by id desc limit 1) like 'You''d get Dunlap%', 'label: ' || (select sub from notifications where type = 'BET_RECEIVED' order by id desc limit 1);
end $$;
select accept_wager((select id from wagers where game_id = 'KXPGAH2H-TEST'));
reset role;
update games set status = 'final', away_score = 0, home_score = 1, commence_time = now() - interval '1 hour' where id = 'KXPGAH2H-TEST';
select settle_game('KXPGAH2H-TEST');
do $$ begin
  assert (select winner from wagers where game_id = 'KXPGAH2H-TEST') = (select id from u where name = 'Mo'), 'Glover beat Dunlap → Mo wins';
  assert exists (select 1 from notifications where sub = 'Glover beat Dunlap'), 'result line';
end $$;
select 'H2H TESTS PASSED' as result;

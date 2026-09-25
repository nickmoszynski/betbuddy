-- Admin dashboard stats
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Dad'), false);
select touch(); select touch();
select pg_temp.expect_error($q$ select admin_stats(30) $q$, 'Admins only');
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Mo'), false);
select touch();
do $$ declare s json; begin
  s := admin_stats(30);
  assert (s->'users'->>'total')::int = 4, 'users total ' || (s->'users');
  assert (s->'users'->>'active_today')::int = 2, 'active today ' || (s->'users');
  assert (s->'users'->>'opens_7d')::int = 3, 'opens ' || (s->'users');
  -- accepted bets from scenarios: g1 dad-mo 50, g2 push 20, g3 counter 25, uncle field 25 → 4 settled (+1 pending from push test)
  assert (s->'bets'->>'settled')::int = 4, 'settled ' || (s->'bets');
  assert (s->'bets'->>'handle')::int = (50+20+25+25)*2, 'handle ' || (s->'bets');
  assert (s->'biggest'->>'amount')::int = 50, 'biggest';
  assert json_array_length(s->'signups_by_day') = 30, 'series length';
  assert (s->'top_games'->0->>'bets')::int = 2, 'top game has 2 bets: ' || (s->'top_games');
  assert exists (select 1 from json_array_elements(s->'leaderboard') x where x->>'name' = 'Dad' and (x->>'net')::int = 75 and (x->>'wins')::int = 2), 'dad net +75 (won 50 + 25, push): ' || (s->'leaderboard');
  assert exists (select 1 from json_array_elements(s->'leaderboard') x where x->>'name' = 'Mo' and (x->>'net')::int = -50), 'mo net -50: ' || (s->'leaderboard');
end $$;
select 'STATS TESTS PASSED' as result;

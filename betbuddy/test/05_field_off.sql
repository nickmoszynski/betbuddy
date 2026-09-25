-- The Field switched off: open bets are refused, 1-on-1 bets still work
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
delete from app_config where key = 'field_enabled';
update games set commence_time = now() + interval '1 day', status = 'upcoming', settled = false where id = 'g3';
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Mo'), false);
select pg_temp.expect_error($q$ select send_wager('g3', 'fav', 5, null, null) $q$, 'Open bets are turned off');
select send_wager('g3', 'fav', 5, 'still fine 1-on-1', (select id from u where name = 'Dad'));
select pg_temp.expect_error($q$ select send_to_field((select id from wagers where message = 'still fine 1-on-1')) $q$, 'Open bets are turned off');
select 'FIELD-OFF TESTS PASSED' as result;

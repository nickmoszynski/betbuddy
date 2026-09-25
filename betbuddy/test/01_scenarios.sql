-- End-to-end money scenarios. Every block raises if something is wrong.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- Users (first one becomes admin)
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000a', '+14135550100'),  -- Mo (admin/bank)
  ('00000000-0000-0000-0000-00000000000d', '+14135550101'),  -- Dad
  ('00000000-0000-0000-0000-00000000000c', '+14135550102'),  -- Uncle
  ('00000000-0000-0000-0000-00000000000e', '+14135550103');  -- Stranger
update profiles set name = 'Mo' where phone = '14135550100';
update profiles set name = 'Dad' where phone = '14135550101';
update profiles set name = 'Uncle Rich' where phone = '14135550102';
update profiles set name = 'Stranger' where phone = '14135550103';

insert into games (id, sport, sport_key, home, away, commence_time, fav_team, spread) values
  ('g1', 'NFL', 'americanfootball_nfl', 'Buffalo Bills', 'Miami Dolphins', now() + interval '2 hours', 'Buffalo Bills', -2.5),
  ('g2', 'NFL', 'americanfootball_nfl', 'New England Patriots', 'New York Jets', now() + interval '3 hours', 'New York Jets', -3.0),
  ('g3', 'NFL', 'americanfootball_nfl', 'Dallas Cowboys', 'New York Giants', now() + interval '4 hours', 'Dallas Cowboys', -6.5);

create temp table u as select name, id from profiles;
grant select on u to authenticated;
create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from u where name = p), false); $$;
create or replace function pg_temp.bal(p text) returns int language sql security definer as $$
  select coalesce(sum(amount),0)::int from public.ledger where user_id = (select id from u where name = p); $$;
create or replace function pg_temp.uid(p text) returns uuid language sql as $$
  select id from u where name = p; $$;
create or replace function pg_temp.expect_error(q text, frag text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'EXPECTED ERROR containing "%" but query succeeded: %', frag, q;
exception when others then
  if sqlerrm like 'EXPECTED ERROR%' or position(frag in sqlerrm) = 0 then raise exception 'Wrong error for %: %', q, sqlerrm; end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

do $$ begin
  assert (select is_admin from profiles where name='Mo'), 'first user should be admin';
  assert not (select is_admin from profiles where name='Dad'), 'dad not admin';
end $$;

set role authenticated;

-- 1. Crew: Dad and Uncle join from Mo's invite link
select pg_temp.as_user('Dad');   select join_via_invite(pg_temp.uid('Mo'));
select pg_temp.as_user('Uncle Rich'); select join_via_invite(pg_temp.uid('Mo'));
do $$ begin
  perform pg_temp.as_user('Dad');
  assert (select count(*) from profiles) = 2, 'Dad sees himself + Mo only, saw ' || (select count(*) from profiles);
end $$;

-- 2. Deposits: only admin can approve
select pg_temp.as_user('Dad');
select request_deposit(100);
select pg_temp.expect_error($q$ select admin_resolve_deposit((select id from deposit_requests limit 1), true) $q$, 'Admins only');
select pg_temp.as_user('Mo');
select admin_resolve_deposit((select id from deposit_requests where status='pending' limit 1), true);
select pg_temp.expect_error($q$ select admin_resolve_deposit((select id from deposit_requests limit 1), true) $q$, 'Already handled');
do $$ begin assert pg_temp.bal('Dad') = 100, 'dad 100 after deposit'; end $$;

-- 3. Tampering is blocked
select pg_temp.as_user('Dad');
select pg_temp.expect_error($q$ insert into ledger (user_id, amount, kind) values (auth.uid(), 1000000, 'deposit') $q$, 'permission denied');
select pg_temp.expect_error($q$ update profiles set is_admin = true where id = auth.uid() $q$, 'permission denied');
select pg_temp.expect_error($q$ update wagers set status = 'settled' $q$, 'permission denied');
select pg_temp.expect_error($q$ select settle_game('g1') $q$, 'permission denied');
select pg_temp.expect_error($q$ select balance_of(auth.uid()) $q$, 'permission denied');

-- 4. Challenges
select pg_temp.expect_error($q$ select send_wager('g1', 'fav', 150, 'too much', pg_temp.uid('Mo')) $q$, 'Not enough');
select pg_temp.expect_error($q$ select send_wager('g1', 'fav', 10, null, pg_temp.uid('Uncle Rich')) $q$, 'only challenge people in your crew');
select send_wager('g1', 'fav', 50, 'Bills by a TD', pg_temp.uid('Mo'));
do $$ declare w json; begin
  w := my_wallet();
  assert (w->>'available')::int = 50 and (w->>'pending')::int = 50, 'dad wallet after send: ' || w;
end $$;

select pg_temp.as_user('Stranger');
do $$ begin assert (select count(*) from wagers) = 0, 'stranger cannot see wager'; end $$;
select pg_temp.expect_error($q$ select accept_wager((select id from wagers limit 1)) $q$, 'no longer open');

-- Mo has $0 → can't accept; deposits 200 then accepts
select pg_temp.as_user('Mo');
select pg_temp.expect_error($q$ select accept_wager((select id from wagers where status='pending' limit 1)) $q$, 'Not enough');
select request_deposit(200);
select admin_resolve_deposit((select id from deposit_requests where status='pending' limit 1), true);
select accept_wager((select id from wagers where status='pending' and game_id='g1'));
select pg_temp.expect_error($q$ select accept_wager((select id from wagers where game_id='g1')) $q$, 'no longer open');
do $$ declare w json; begin
  w := my_wallet();
  assert (w->>'available')::int = 150 and (w->>'locked')::int = 50, 'mo wallet after accept: ' || w;
end $$;

-- Trash talk: participants only
select pg_temp.as_user('Dad');
insert into messages (wager_id, user_id, body) values ((select id from wagers where game_id='g1'), auth.uid(), 'Bills cover easy');
select pg_temp.as_user('Uncle Rich');
select pg_temp.expect_error($q$ insert into messages (wager_id, user_id, body) values ('00000000-0000-0000-0000-000000000000', auth.uid(), 'hi') $q$, 'row-level security');

-- 5. Push on g2: Jets -3, Jets win by exactly 3
select pg_temp.as_user('Dad');
select send_wager('g2', 'dog', 20, null, pg_temp.uid('Mo'));
select pg_temp.as_user('Mo');
select accept_wager((select id from wagers where game_id='g2'));

-- 6. Counter: Dad challenges Mo $30 on g3 dog, Mo counters at $25
select pg_temp.as_user('Dad');
select send_wager('g3', 'dog', 30, null, pg_temp.uid('Mo'));
select pg_temp.as_user('Mo');
select counter_wager((select id from wagers where game_id='g3' and status='pending'), 25);
do $$ begin
  assert (select count(*) from wagers where game_id='g3' and status='declined') = 1, 'original declined';
  assert (select side from wagers where game_id='g3' and status='pending') = 'fav', 'counter takes opposite side';
end $$;
select pg_temp.as_user('Dad');
select accept_wager((select id from wagers where game_id='g3' and status='pending'));

-- 7. The Field: Uncle posts open bet, Mo (friend) takes it, Dad (not Uncle's friend) can't see it
select pg_temp.as_user('Uncle Rich'); select request_deposit(60);
select pg_temp.as_user('Mo'); select admin_resolve_deposit((select id from deposit_requests where status='pending' limit 1), true);
select pg_temp.as_user('Uncle Rich');
select send_wager('g1', 'dog', 25, 'Fins cover', null);
select pg_temp.as_user('Dad');
do $$ begin assert (select count(*) from wagers where to_user is null) = 0, 'dad cannot see uncle field bet'; end $$;
select pg_temp.as_user('Mo');
do $$ begin assert (select count(*) from wagers where to_user is null) = 1, 'mo sees uncle field bet'; end $$;
select accept_wager((select id from wagers where to_user is null));

-- 8. Expiry: a pending bet on a game that starts gets refunded
select pg_temp.as_user('Dad');
select send_wager('g2', 'fav', 5, null, pg_temp.uid('Mo'));
reset role;
update games set commence_time = now() - interval '1 minute', status = 'live' where id in ('g1','g2','g3');
select expire_started();
set role authenticated;
select pg_temp.as_user('Mo');
select pg_temp.expect_error($q$ select send_wager('g1', 'fav', 5, null, pg_temp.uid('Dad')) $q$, 'already started');

-- 9. Settlement (as the scheduled job would)
reset role;
update games set status='final', home_score=27, away_score=24 where id='g1';  -- Bills -2.5 cover (win by 3)
update games set status='final', home_score=17, away_score=20 where id='g2';  -- Jets -3 win by 3 → push
update games set status='final', home_score=20, away_score=17 where id='g3';  -- Cowboys -6.5 fail → Giants (dog) win
select settle_game('g1'), settle_game('g2'), settle_game('g3');
do $$ begin
  -- Dad: 100 dep; g1 fav won (+50 net); g2 push; g3 dog won (+25 net); g2 expired 5 refunded → 175
  assert pg_temp.bal('Dad') = 175, 'dad final ' || pg_temp.bal('Dad');
  -- Mo: 200 dep; lost g1 to dad -50; push; lost g3 -25; beat Uncle's field bet (Mo took fav Bills -2.5, won) +25 → 150
  assert pg_temp.bal('Mo') = 150, 'mo final ' || pg_temp.bal('Mo');
  assert pg_temp.bal('Uncle Rich') = 35, 'uncle final ' || pg_temp.bal('Uncle Rich');
  assert (select count(*) from wagers where status='locked') = 0, 'nothing left locked';
  assert (select winner from wagers where game_id='g2' and status='settled') is null, 'push has no winner';
end $$;

-- 10. Cash out
set role authenticated;
select pg_temp.as_user('Dad');
select pg_temp.expect_error($q$ select request_withdrawal(500, '@dad-venmo') $q$, 'only have');
select request_withdrawal(100, '@dad-venmo');
do $$ begin assert pg_temp.bal('Dad') = 75, 'dad after cashout request'; end $$;
select pg_temp.as_user('Mo');
select admin_resolve_withdrawal((select id from withdrawal_requests where status='pending'), false);
do $$ begin assert pg_temp.bal('Dad') = 175, 'dad refunded after rejected cashout'; end $$;
select pg_temp.as_user('Dad');
select request_withdrawal(150, 'dad-venmo');
select pg_temp.as_user('Mo');
select admin_resolve_withdrawal((select id from withdrawal_requests where status='pending'), true);

-- 11. Books balance: money in the system == deposits − cash-outs paid
do $$ declare s json; begin
  perform pg_temp.as_user('Mo');
  s := admin_summary();
  assert (s->>'available')::int + (s->>'in_bets')::int = (s->>'deposited')::int - (s->>'paid_out')::int, 'books do not balance: ' || s;
  assert (s->>'available')::int = 25 + 150 + 35, 'total available ' || s;
end $$;

-- 12. Notifications + texts were generated
reset role;
do $$ begin
  assert (select count(*) from notifications) > 10, 'notifications created';
  assert exists (select 1 from sms_outbox where body like '%challenged you%'), 'challenge SMS queued';
  assert exists (select 1 from sms_outbox where to_phone = '14135550100' and body like '%Venmo''d you%'), 'admin deposit SMS queued';
end $$;

select 'ALL SCENARIOS PASSED' as result;

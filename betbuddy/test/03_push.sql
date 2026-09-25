-- Push notifications: subscriptions are private, notifications queue pushes, server claims once.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Dad'), false);
select save_push_subscription('https://push.example/dad-phone', 'p256', 'auth1');
select save_push_subscription('https://push.example/dad-phone', 'p256b', 'auth2');   -- re-save = update, not duplicate
select pg_temp.expect_error($q$ select * from push_subscriptions $q$, 'permission denied');
select pg_temp.expect_error($q$ select claim_push(10) $q$, 'permission denied');
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Uncle Rich'), false);
select remove_push_subscription('https://push.example/dad-phone');                   -- can't remove someone else's
reset role;
do $$ begin
  assert (select count(*) from push_subscriptions) = 1, 'one dad subscription';
  assert (select auth from push_subscriptions) = 'auth2', 'updated keys';
end $$;
-- A new challenge to Dad queues a push for Dad only (Mo has no subscription)
update games set commence_time = now() + interval '1 day', status = 'upcoming', settled = false where id = 'g1';
insert into ledger (user_id, amount, kind) select id, 100, 'adjustment' from profiles where name = 'Mo';
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from u where name = 'Mo'), false);
select send_wager('g1', 'dog', 10, 'push test', (select id from u where name = 'Dad'));
reset role;
do $$ begin
  assert (select count(*) from push_outbox) = 1, 'exactly one push queued, got ' || (select count(*) from push_outbox);
  assert (select title from push_outbox) like 'Mo challenged you%', 'push title: ' || (select title from push_outbox);
  assert (select url from push_outbox) = '/?tab=inbox', 'deep link to inbox';
end $$;
set role service_role;
do $$ begin
  assert (select count(*) from claim_push(10)) = 1, 'claimed once';
  assert (select count(*) from claim_push(10)) = 0, 'never twice';
end $$;
select 'PUSH TESTS PASSED' as result;

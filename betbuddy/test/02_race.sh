#!/bin/bash
# Double-spend check: 10 simultaneous $50 challenges from someone with $175 → at most 3 succeed
DB=bbtest
su postgres -c "psql -q -d $DB -c \"update games set commence_time = now() + interval '1 day', status='upcoming', settled=false where id='g1'\""
DAD=$(su postgres -c "psql -tA -d $DB -c \"select id from profiles where name='Dad'\"")
MO=$(su postgres -c "psql -tA -d $DB -c \"select id from profiles where name='Mo'\"")
su postgres -c "psql -q -d $DB -c \"insert into ledger (user_id, amount, kind) values ('$DAD', 150, 'adjustment')\""  # dad now 175
for i in $(seq 1 10); do
  su postgres -c "psql -q -d $DB -c \"set role authenticated; select set_config('request.jwt.claim.sub','$DAD',false); select send_wager('g1','fav',50,null,'$MO');\"" >/dev/null 2>&1 &
done
wait
su postgres -c "psql -tA -d $DB -c \"select count(*) || ' sent, balance ' || (select sum(amount) from ledger where user_id='$DAD') from wagers where status='pending' and from_user='$DAD'\""

-- ════════════════════════════════════════════════════════════════════
-- BetBuddy — push notifications (run after 001_betbuddy.sql)
-- Every in-app notification is also pushed to the person's phone(s).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_outbox (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text,
  url        text not null default '/',
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- Server-only settings (the push signing keys are generated here automatically)
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

alter table push_subscriptions enable row level security;
alter table push_outbox        enable row level security;
alter table app_config         enable row level security;
revoke all on push_subscriptions, push_outbox, app_config from anon, authenticated;

-- Every notification now also queues a push
create or replace function public.notify(
  p_user uuid, p_type text, p_msg text, p_sub text default null, p_amt int default null,
  p_actor uuid default null, p_wager uuid default null, p_sms text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_phone text; v_alerts boolean;
begin
  insert into notifications (user_id, type, msg, sub, amt, actor_id, wager_id)
  values (p_user, p_type, p_msg, p_sub, p_amt, p_actor, p_wager);

  if exists (select 1 from push_subscriptions where user_id = p_user) then
    insert into push_outbox (user_id, title, body, url)
    values (p_user, p_msg, p_sub, case when p_type in ('BET_RECEIVED','BET_COUNTER','FIELD_MATCHED') then '/?tab=inbox' else '/' end);
  end if;

  if p_sms is not null then
    select phone, sms_alerts into v_phone, v_alerts from profiles where id = p_user;
    if v_phone is not null and v_alerts then
      insert into sms_outbox (to_phone, body) values (v_phone, p_sms);
    end if;
  end if;
end $$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Server job: claim queued pushes atomically (never sends twice)
create or replace function public.claim_push(p_limit int default 50)
returns table (id bigint, user_id uuid, title text, body text, url text)
language sql security definer set search_path = public as $$
  update push_outbox o set sent_at = now()
  where o.id in (select x.id from push_outbox x where x.sent_at is null and x.created_at > now() - interval '1 hour'
                 order by x.id limit p_limit for update skip locked)
  returning o.id, o.user_id, o.title, o.body, o.url;
$$;

revoke execute on function save_push_subscription(text, text, text), remove_push_subscription(text), claim_push(int) from public, anon, authenticated;
grant execute on function save_push_subscription(text, text, text), remove_push_subscription(text) to authenticated;
grant execute on function claim_push(int) to service_role;
grant all on push_subscriptions, push_outbox, app_config to service_role;
grant usage on all sequences in schema public to service_role;

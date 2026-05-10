-- Push subscriptions WebPush PWA — un endpoint par device.
-- Idempotent. Stocke endpoint + clés (p256dh, auth) + métadonnées.

create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  is_active boolean not null default true
);
create index if not exists idx_push_profile on push_subscriptions (profile_id, is_active);

alter table push_subscriptions enable row level security;

drop policy if exists ps_self  on push_subscriptions;
drop policy if exists ps_admin on push_subscriptions;

create policy ps_self  on push_subscriptions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy ps_admin on push_subscriptions for select using (is_rh());

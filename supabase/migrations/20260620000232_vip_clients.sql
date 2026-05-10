-- Clients VIP & essayages.
--
-- Suivi clientèle haute valeur pour la boutique caftans :
--   * vip_clients : fiche cliente (taille, prefs couleur, vendeuse préférée).
--                   Consentement RGPD horodaté à la création (champ obligatoire
--                   côté UI, ici on stocke juste l'instant de capture).
--   * vip_visits  : timeline des visites/essayages/achats/retours.
--
-- Politiques :
--   - is_rh() : full CRUD
--   - is_manager() (manager/rh/admin) : lecture
--   - INSERT vip_clients par une vendeuse : autorisée si created_by = auth.uid()
--     ET l'utilisateur est lié à un employee actif.
--   - INSERT vip_visits : autorisée si seller_id pointe sur son propre employee.
--
-- Idempotent.

create table if not exists vip_clients (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  phone text,
  email text,
  dress_size text,
  color_prefs text,
  notes text,
  preferred_seller_id uuid references employees(id) on delete set null,
  preferred_site_id uuid references sites(id) on delete set null,
  birth_date date,
  language text default 'fr',
  consent_recorded_at timestamptz default now(),
  is_active boolean default true,
  created_at timestamptz default now(),
  created_by uuid references profiles(id) on delete set null
);
create index if not exists idx_vip_clients_seller on vip_clients (preferred_seller_id);
create index if not exists idx_vip_clients_site   on vip_clients (preferred_site_id);
-- Index "mois-jour" pour la détection d'anniversaires.
-- to_char() n'est pas IMMUTABLE en PG → on utilise (extract month/day) qui le sont.
create index if not exists idx_vip_clients_birth_md
  on vip_clients ((extract(month from birth_date)), (extract(day from birth_date)))
  where birth_date is not null and is_active is true;

create table if not exists vip_visits (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references vip_clients(id) on delete cascade,
  visited_at timestamptz default now(),
  seller_id uuid references employees(id) on delete set null,
  site_id uuid references sites(id) on delete set null,
  kind text default 'visit' check (kind in ('visit','fitting','purchase','return')),
  notes text,
  follow_up_date date
);
create index if not exists idx_vip_visits_client on vip_visits (client_id, visited_at desc);

alter table vip_clients enable row level security;
alter table vip_visits  enable row level security;

drop policy if exists vc_admin       on vip_clients;
drop policy if exists vc_read        on vip_clients;
drop policy if exists vc_self_create on vip_clients;
drop policy if exists vv_admin       on vip_visits;
drop policy if exists vv_read        on vip_visits;
drop policy if exists vv_self_create on vip_visits;

create policy vc_admin on vip_clients for all using (is_rh()) with check (is_rh());
create policy vc_read  on vip_clients for select using (is_manager());
create policy vc_self_create on vip_clients for insert with check (
  created_by = auth.uid()
  and exists (
    select 1 from employees e
     where e.profile_id = auth.uid()
       and e.status = 'active'
  )
);

create policy vv_admin on vip_visits for all using (is_rh()) with check (is_rh());
create policy vv_read  on vip_visits for select using (is_manager());
create policy vv_self_create on vip_visits for insert with check (
  exists (
    select 1 from employees e
     where e.id = vip_visits.seller_id
       and e.profile_id = auth.uid()
       and e.status = 'active'
  )
);

do $$ begin
  begin alter publication supabase_realtime add table vip_clients; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table vip_visits;  exception when duplicate_object then null; end;
end $$;

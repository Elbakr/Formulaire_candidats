-- Karim 2026-06-15 : disponibilités déclarées par les employés (renforts/remplacements)
-- Un employé peut déclarer des créneaux récurrents (day_of_week 0..6)
-- ou ponctuels (specific_date) où il est disponible pour un renfort.

create table if not exists public.employee_availability (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  -- Récurrent OU ponctuel (l'un des deux doit être renseigné, pas les deux)
  day_of_week   int,          -- 0=Dimanche … 6=Samedi ; null si ponctuel
  specific_date date,         -- date précise ; null si récurrent
  start_time    time not null,
  end_time      time not null,
  available_for_reinforcement boolean not null default true,
  note          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Index actif : recherches fréquentes par employé (is_active=true)
create index if not exists idx_employee_availability_employee_active
  on public.employee_availability(employee_id)
  where is_active = true;

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.employee_availability enable row level security;

-- Admin / RH : lecture totale
drop policy if exists "admin rh read employee_availability" on public.employee_availability;
create policy "admin rh read employee_availability" on public.employee_availability for select
  using (
    (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );

-- Admin / RH : écriture totale
drop policy if exists "admin rh manage employee_availability" on public.employee_availability;
create policy "admin rh manage employee_availability" on public.employee_availability for all
  using (
    (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  )
  with check (
    (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );

-- Employé : lit SES propres lignes
-- Lien : employees.profile_id = auth.uid()
drop policy if exists "employee read own availability" on public.employee_availability;
create policy "employee read own availability" on public.employee_availability for select
  using (
    employee_id in (
      select id from public.employees where profile_id = auth.uid()
    )
  );

-- Employé : insère SES propres lignes (employee_id doit correspondre à son profil)
drop policy if exists "employee insert own availability" on public.employee_availability;
create policy "employee insert own availability" on public.employee_availability for insert
  with check (
    employee_id in (
      select id from public.employees where profile_id = auth.uid()
    )
  );

-- Employé : met à jour SES propres lignes
drop policy if exists "employee update own availability" on public.employee_availability;
create policy "employee update own availability" on public.employee_availability for update
  using (
    employee_id in (
      select id from public.employees where profile_id = auth.uid()
    )
  )
  with check (
    employee_id in (
      select id from public.employees where profile_id = auth.uid()
    )
  );

-- Employé : supprime SES propres lignes
drop policy if exists "employee delete own availability" on public.employee_availability;
create policy "employee delete own availability" on public.employee_availability for delete
  using (
    employee_id in (
      select id from public.employees where profile_id = auth.uid()
    )
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- Annonces broadcast — diffusion par admin (Karim) vers magasins / managers / employés
--
-- Une "annonce" = un row `broadcasts` + (optionnellement) des messages
-- postés dans les chat_rooms ciblées (avec attachments[0].kind='broadcast').
-- Les canaux email/whatsapp sont déclenchés côté server action.
--
-- Idempotente.

create table if not exists broadcasts (
  id uuid primary key default uuid_generate_v4(),
  author_profile_id uuid references profiles(id) on delete set null,
  title text not null,
  body text not null,
  audience_kind text not null default 'all_sites',
  -- 'all_sites' | 'specific_sites' | 'role_managers' | 'role_employees'
  audience_site_ids uuid[],
  priority text not null default 'normal',
  -- 'normal' | 'important' | 'urgent'
  send_chat boolean not null default true,
  send_email boolean not null default false,
  send_whatsapp boolean not null default false,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_broadcasts_sent on broadcasts (sent_at desc);
create index if not exists idx_broadcasts_audience on broadcasts (audience_kind);

alter table broadcasts enable row level security;

drop policy if exists bc_admin_all on broadcasts;
drop policy if exists bc_member_read on broadcasts;

create policy bc_admin_all on broadcasts for all using (is_rh()) with check (is_rh());

-- Lecture employé : si l'annonce le concerne (all_sites, role_*, ou un site
-- où il est assigné).
create policy bc_member_read on broadcasts for select using (
  audience_kind = 'all_sites'
  or audience_kind = 'role_employees'
  or audience_kind = 'role_managers'
  or (
    audience_kind = 'specific_sites'
    and exists (
      select 1
      from site_assignments sa
      inner join employees e on e.id = sa.employee_id
      where sa.site_id = any(audience_site_ids)
        and e.profile_id = auth.uid()
    )
  )
);

do $$ begin
  begin alter publication supabase_realtime add table broadcasts; exception when duplicate_object then null; end;
end $$;

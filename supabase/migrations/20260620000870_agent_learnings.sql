-- Karim 2026-06-14 : agent d'astreinte — incrément 2a (QCM + apprentissage).
--
-- `agent_learnings` : ce que l'admin a APPRIS à l'agent via les QCM des
-- notifications. Une ligne = une consigne pour un type de panne (signature) :
-- comment la traiter à l'avenir (notify_only / ignore_auto / auto_fix).
--
-- Garde-fous anti-dérive :
--   * Une règle n'existe que si l'admin a explicitement choisi une option QCM.
--   * `active` = révocable à tout moment (on désactive, on ne supprime pas → trace).
--   * `org_settings.incident_auto_paused` = interrupteur global « Pause auto » :
--     quand true, l'agent n'applique AUCUNE règle auto (revient à juste notifier).
--   * Au plus 1 règle active par signature (index unique partiel).
--
-- Idempotente.

create table if not exists public.agent_learnings (
  id            uuid primary key default gen_random_uuid(),
  signature     text not null,                    -- type de panne (ex: 'failed_mails')
  question_key  text not null default 'default',
  chosen_option text not null,                    -- 'notify_only' | 'ignore_auto' | 'auto_fix'
  mode          text not null default 'auto',     -- 'auto' (agit seul) | 'suggest' (mémorise sans agir)
  decided_by    uuid,                             -- profile.id de l'admin
  active        boolean not null default true,    -- révocable
  created_at    timestamptz not null default now()
);

create unique index if not exists uniq_agent_learnings_active
  on public.agent_learnings (signature, question_key) where active;

create index if not exists idx_agent_learnings_signature
  on public.agent_learnings (signature) where active;

alter table public.agent_learnings enable row level security;

drop policy if exists agent_learnings_admin_read on public.agent_learnings;
create policy agent_learnings_admin_read on public.agent_learnings
  for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'rh')
  ));

-- Interrupteur global « Pause auto » (kill-switch) dans org_settings (id=1).
alter table public.org_settings
  add column if not exists incident_auto_paused boolean not null default false;

notify pgrst, 'reload schema';

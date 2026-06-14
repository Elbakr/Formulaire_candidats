-- Karim 2026-06-14 : anti-récidive des pointages perdus (OUT/IN manquants).
--
-- Le poll Tuya (lib/tuya-poll.ts) tente déjà d'enregistrer chaque badge rejeté
-- faute de mapping dans `tuya_unmapped_slots` (best-effort). MAIS la table
-- n'existait pas en prod → l'upsert échouait en silence → les badges droppés
-- étaient invisibles (cause racine des OUT manquants quand un slot n'est pas
-- mappé). On crée la table : désormais chaque badge perdu est tracé, et le
-- health-check `unmapped_badges` le remonte en incident (agent d'astreinte).
--
-- Idempotente.

create table if not exists public.tuya_unmapped_slots (
  tuya_device_id text not null,
  tuya_user_id   text not null,         -- slot local non reconnu
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  event_count    integer not null default 1,
  resolved_at    timestamptz,           -- renseigné quand le slot finit par être mappé
  primary key (tuya_device_id, tuya_user_id)
);

create index if not exists idx_tuya_unmapped_lastseen
  on public.tuya_unmapped_slots (last_seen_at desc) where resolved_at is null;

alter table public.tuya_unmapped_slots enable row level security;

drop policy if exists tuya_unmapped_slots_read on public.tuya_unmapped_slots;
create policy tuya_unmapped_slots_read on public.tuya_unmapped_slots
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'rh', 'manager')
  ));

notify pgrst, 'reload schema';

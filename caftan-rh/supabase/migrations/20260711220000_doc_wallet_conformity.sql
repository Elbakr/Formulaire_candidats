-- Karim 2026-07-11 : valise document — conformité IA + expiration + rappels
-- échelonnés (45/30/15/7/0 j). Champs sur la banque de documents (chaque doc peut
-- porter une date d'expiration + un statut de conformité IA), et palier de rappel
-- sur employees (jusqu'à quel seuil l'admin a déjà été notifié pour le séjour).
alter table public.documents
  add column if not exists expiry_date date,
  add column if not exists ia_status text,       -- 'conforme' | 'non_conforme' | 'illisible' | 'a_verifier'
  add column if not exists ia_note text,
  add column if not exists ia_checked_at timestamptz,
  add column if not exists last_reminder_stage integer not null default 0;

alter table public.employees
  add column if not exists residence_doc_reminder_stage integer not null default 0;

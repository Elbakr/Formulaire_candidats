-- Karim 2026-07-08 : socle de permissions par utilisateur (extensible).
-- Chaque profil porte un tableau de clés de permission (ex. 'payslips').
-- L'admin a TOUT implicitement (pas besoin de la clé). Les RH n'ont une
-- permission que si elle est présente dans ce tableau (octroi par l'admin).
-- Additif, idempotent, défaut vide = aucune permission spéciale.
alter table public.profiles
  add column if not exists permissions text[] not null default '{}';

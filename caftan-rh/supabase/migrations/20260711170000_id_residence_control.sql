-- Karim 2026-07-11 : contrôle intelligent CI / titre de séjour (v1).
--
-- Après extraction IA (Claude Vision) de la carte d'identité / titre de séjour,
-- le travailleur CONFIRME les champs (auto-remplis), et le système vérifie la
-- validité du document + le droit au travail (UE vs hors-UE -> escalade admin).
-- Champs additionnels (nullable) sur employees ET candidates (le flux token peut
-- viser l'un ou l'autre).
--
-- work_authorization :
--   'ue'          -> nationalité UE/EEE/Suisse : droit au travail sans titre
--   'titre_valide'-> hors-UE, titre de séjour valide autorisant le travail (à valider)
--   'a_verifier'  -> hors-UE / titre à vérifier PAR L'ADMIN (docs à demander)
--   'refuse'      -> document expiré / ne permet pas le travail
--   NULL          -> non déterminé

do $$
declare t text;
begin
  foreach t in array array['employees','candidates'] loop
    execute format('alter table public.%I add column if not exists residence_doc_type text', t);
    execute format('alter table public.%I add column if not exists residence_doc_expiry date', t);
    execute format('alter table public.%I add column if not exists residence_doc_number text', t);
    execute format('alter table public.%I add column if not exists work_authorization text', t);
    execute format('alter table public.%I add column if not exists id_extracted_at timestamptz', t);
  end loop;
end $$;

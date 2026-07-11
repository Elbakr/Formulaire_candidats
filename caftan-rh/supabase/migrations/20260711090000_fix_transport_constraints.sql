-- Karim 2026-07-11 : FIX DÉFINITIF des contraintes transport (récidive).
--
-- Bug : en choisissant un transport SANS abonnement (marche, vélo, voiture,
-- scooter, covoiturage), le formulaire fixe transport_frequency = 'sans_objet'
-- (cf. contract-info-form.tsx), mais la contrainte n'autorisait que
-- 'mensuel'/'annuel' -> "violates check constraint" affiché sous le champ, envoi
-- bloqué. Le candidat ne pouvait pas soumettre.
--
-- Cause de fond (pattern récurrent) : whitelist DB désynchronisée des options du
-- <select>. Correctif : la contrainte accepte EXACTEMENT les valeurs de l'UI
-- (mensuel / annuel / sans_objet) + NULL. Plus de désync possible avec le form.

-- 1) transport_frequency : accepte 'sans_objet' (+ NULL) en plus de mensuel/annuel.
alter table public.employees
  drop constraint if exists employees_transport_frequency_check;
alter table public.employees
  add constraint employees_transport_frequency_check
  check (
    transport_frequency is null
    or transport_frequency = any (array['mensuel'::text, 'annuel'::text, 'sans_objet'::text])
  );

-- 2) Filet : supprime toute contrainte HISTORIQUE (mal nommée) sur le TYPE de
--    transport qui rejetterait 'marche', 'scooter/moto', etc. (c'est le nom cité
--    dans l'erreur du candidat : employees_tranport_check). Idempotent : no-op si
--    elle n'existe pas. On NE recrée PAS de whitelist rigide sur transport_type :
--    l'app valide déjà via le <select> (src/lib/config.ts TRANSPORT_MODES), et une
--    whitelist DB figée est précisément la source des récidives.
alter table public.employees drop constraint if exists employees_tranport_check;
alter table public.employees drop constraint if exists employees_transport_check;
alter table public.employees drop constraint if exists employees_transport_type_check;

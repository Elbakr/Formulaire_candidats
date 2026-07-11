-- Karim 2026-07-11 : le mode AUTO-VARIANT est désormais ACTIF PAR DÉFAUT pour tous
-- les employés (la tablette choisit automatiquement le variant du jour). L'admin/rh
-- peut le désactiver au cas par cas (setWorkerAutoVariantAction). On active donc le
-- flag pour TOUS les employés existants + on bascule le défaut de la colonne à true.
--
-- NB : Auto-Variant et Auto-Shift restent mutuellement exclusifs. On n'active
-- Auto-Variant QUE pour les employés qui ne sont pas déjà en Auto-Shift, afin de ne
-- pas casser cette exclusivité.

alter table public.employees
  alter column auto_variant set default true;

update public.employees
  set auto_variant = true
  where auto_variant is distinct from true
    and coalesce(auto_shift, false) = false;

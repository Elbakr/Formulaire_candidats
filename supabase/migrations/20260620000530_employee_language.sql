-- Karim 2026-05-29 : langue preferee de l employee pour personnaliser
-- le mail de contrat envoye via DocuSeal (FR par defaut, NL pour Flandre).

alter table public.employees
  add column if not exists preferred_language text default 'fr'
    check (preferred_language in ('fr', 'nl', 'en'));

-- Initialise NL pour les sites Anvers (C, F) par defaut
update public.employees e
set preferred_language = 'nl'
where exists (
  select 1 from public.site_assignments sa
  join public.sites s on s.id = sa.site_id
  where sa.employee_id = e.id
    and sa.is_primary
    and s.code in ('C', 'F')
)
and (preferred_language is null or preferred_language = 'fr');

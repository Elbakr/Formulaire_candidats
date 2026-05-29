-- Karim 2026-05-29 : ajoute les colonnes DocuSeal a employee_contracts.
-- Permet de tracker une submission DocuSeal et son statut.

alter table public.employee_contracts
  add column if not exists docuseal_submission_id bigint,
  add column if not exists docuseal_status text check (
    docuseal_status is null or
    docuseal_status in ('pending','sent','opened','completed','declined')
  );

-- Index pour lookup rapide depuis webhook
create index if not exists idx_employee_contracts_docuseal_submission
  on public.employee_contracts(docuseal_submission_id)
  where docuseal_submission_id is not null;

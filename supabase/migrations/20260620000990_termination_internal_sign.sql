-- Karim 2026-06-17 : signature INTERNE de la convention de rupture amiable
-- (remplace DocuSeal, comme les contrats sur /sign). Colonnes nécessaires au
-- flux token magique : on stocke le corps HTML rendu (ton layout 402.00 validé,
-- employeur pré-signé + marqueur signature travailleur), le token, l'expiration,
-- la signature PNG et l'IP.
alter table public.contract_terminations
  add column if not exists signing_token text,
  add column if not exists signing_token_expires_at timestamptz,
  add column if not exists signed_body text,
  add column if not exists employee_signature_png text,
  add column if not exists signed_ip text;

create unique index if not exists idx_ct_signing_token
  on public.contract_terminations (signing_token)
  where signing_token is not null;

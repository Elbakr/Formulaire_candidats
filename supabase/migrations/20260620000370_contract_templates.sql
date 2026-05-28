-- Karim 2026-05-22 : modeles de contrats reutilisables + signature digitale.
-- 3 types : employe (temps plein), employe temps partiel, etudiant.
-- Le RH choisit un modele, le systeme pre-remplit avec les donnees de la
-- fiche employe, envoie un lien magique a l employe pour signature au doigt.

create table if not exists contract_templates (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,                  -- ex: 'employee', 'employee_pt', 'student'
  name text not null,                          -- libelle FR pour le RH
  kind text not null,                          -- 'employee' | 'employee_pt' | 'student'
  title text not null,                         -- titre affiche dans le doc
  body_markdown text not null,                 -- contenu avec {{variables}}
  has_schedule_annex boolean not null default false,
  paritary_commission text default 'CP du commerce de détail indépendant n°201',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_templates_kind_idx on contract_templates(kind) where is_active;

-- Etend employee_contracts pour le workflow signature digitale.
alter table employee_contracts
  add column if not exists template_id uuid references contract_templates(id),
  add column if not exists signing_token text unique,
  add column if not exists signing_token_expires_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_ip text,
  add column if not exists employee_signature_png text,    -- base64 PNG (canvas)
  add column if not exists employer_signature_png text,
  add column if not exists signed_pdf_url text,
  add column if not exists rendered_body text;              -- contenu apres substitution

comment on column employee_contracts.signing_token is
  'Karim 2026-05-22 : token magique pour la page /sign/[token]. UUID random, expire en 14j.';
comment on column employee_contracts.employee_signature_png is
  'Karim 2026-05-22 : signature dessinee au canvas par l employe, stockee en base64 PNG.';

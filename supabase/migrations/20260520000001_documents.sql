-- Vague 2 — Échange de documents : catalogue, magic links upload, validation

-- ---------------------------------------------------------------------------
-- 1) Catalogue des documents requis
-- ---------------------------------------------------------------------------
create table if not exists document_catalog (
  slug text primary key,
  label text not null,
  category text default 'admin',                -- admin | legal | bank | medical | other
  applies_to text not null default 'candidate', -- candidate | employee | both
  required_at_stage text,                       -- sourcing | recruitment | hiring | onboarding | daily | offboarding
  is_required boolean default true,
  default_template_slug text references email_templates(slug) on delete set null,
  description text,
  position integer default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) Magic link tokens
-- ---------------------------------------------------------------------------
create table if not exists document_upload_tokens (
  id uuid primary key default uuid_generate_v4(),
  token text unique not null,                                    -- random URL-safe
  candidate_id uuid references candidates(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  doc_slug text references document_catalog(slug) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  status text default 'active',                                  -- active | used | expired | revoked
  hint text,
  created_at timestamptz not null default now()
);
create index if not exists idx_doc_tokens_token on document_upload_tokens (token) where status = 'active';
create index if not exists idx_doc_tokens_target on document_upload_tokens (candidate_id, employee_id);

-- ---------------------------------------------------------------------------
-- 3) Extend documents
-- ---------------------------------------------------------------------------
-- The existing document_kind enum is limited (cv, cover_letter, id_card, diploma, other).
-- We add catalog_slug as a free-form FK so we can extend categories without altering
-- the enum. application_id stays on documents but becomes nullable so we can attach
-- documents directly to a candidate or an employee record (e.g. uploaded through a
-- magic link before/after hire).
alter table documents
  add column if not exists catalog_slug text references document_catalog(slug) on delete set null,
  add column if not exists candidate_id uuid references candidates(id) on delete cascade,
  add column if not exists employee_id uuid references employees(id) on delete cascade,
  add column if not exists upload_token_id uuid references document_upload_tokens(id) on delete set null,
  add column if not exists validated_by uuid references profiles(id) on delete set null,
  add column if not exists validated_at timestamptz,
  add column if not exists validation_status text default 'pending', -- pending | accepted | rejected
  add column if not exists rejection_reason text;

alter table documents alter column application_id drop not null;

create index if not exists idx_documents_catalog on documents (catalog_slug);
create index if not exists idx_documents_candidate on documents (candidate_id);
create index if not exists idx_documents_employee on documents (employee_id);
create index if not exists idx_documents_validation on documents (validation_status);

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
alter table document_catalog enable row level security;
alter table document_upload_tokens enable row level security;

drop policy if exists doc_catalog_read on document_catalog;
create policy doc_catalog_read on document_catalog for select using (is_manager());
drop policy if exists doc_catalog_rh_write on document_catalog;
create policy doc_catalog_rh_write on document_catalog for all using (is_rh()) with check (is_rh());

drop policy if exists doc_tokens_rh_all on document_upload_tokens;
create policy doc_tokens_rh_all on document_upload_tokens for all using (is_rh()) with check (is_rh());

-- ---------------------------------------------------------------------------
-- 5) Realtime
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    alter publication supabase_realtime add table documents;
  exception when duplicate_object then null;
  end;
end $$;

do $$ begin
  begin
    alter publication supabase_realtime add table document_upload_tokens;
  exception when duplicate_object then null;
  end;
end $$;

do $$ begin
  begin
    alter publication supabase_realtime add table document_catalog;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Seed catalogue (idempotent)
-- ---------------------------------------------------------------------------
insert into document_catalog (slug, label, category, applies_to, required_at_stage, position, description) values
  ('cv',                       'CV',                                    'admin',   'candidate', 'sourcing',   1,  'Curriculum Vitae à jour'),
  ('cover_letter',             'Lettre de motivation',                  'admin',   'candidate', 'sourcing',   2,  'Optionnel'),
  ('id_card_front',            'Carte d''identité (recto)',             'legal',   'both',      'hiring',     10, 'Photo nette du recto'),
  ('id_card_back',             'Carte d''identité (verso)',             'legal',   'both',      'hiring',     11, 'Photo nette du verso'),
  ('nrn_proof',                'Justificatif numéro registre national', 'legal',   'both',      'hiring',     12, '11 chiffres XX.XX.XX-XXX.XX'),
  ('iban',                     'IBAN bancaire',                         'bank',    'both',      'hiring',     20, 'BE__ ____ ____ ____'),
  ('contract_signed',          'Contrat signé',                         'legal',   'employee',  'hiring',     30, 'Document scanné ou signé en personne'),
  ('dimona_proof',             'Preuve Dimona',                         'legal',   'employee',  'hiring',     31, 'Numéro de référence de la déclaration'),
  ('mutuelle_certificate',     'Attestation mutuelle',                  'medical', 'employee',  'onboarding', 40, 'Affiliation mutuelle déclarée'),
  ('medical_certificate',      'Certificat médical',                    'medical', 'employee',  'onboarding', 41, 'Aptitude au travail si requis'),
  ('family_allowance_caisse',  'Caisse allocations familiales',         'admin',   'employee',  'onboarding', 50, 'Numéro d''affiliation'),
  ('transport_subscription',   'Abonnement transport',                  'admin',   'employee',  'onboarding', 60, 'Photo de la carte STIB/SNCB/TEC'),
  ('diploma',                  'Diplôme',                               'admin',   'employee',  'onboarding', 70, 'Si requis pour le poste'),
  ('other',                    'Autre document',                        'other',   'both',      null,         99, 'Document divers')
on conflict (slug) do nothing;

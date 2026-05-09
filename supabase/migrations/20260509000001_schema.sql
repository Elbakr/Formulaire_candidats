-- CaftanRH — schéma initial
-- Tables : profiles, departments, jobs, candidates, applications, interviews, notes, messages, documents

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create type app_role as enum ('admin', 'rh', 'manager', 'candidate');

create type application_status as enum (
  'new',          -- nouvelle candidature reçue
  'contacted',    -- premier contact établi
  'rdv_scheduled',-- entretien planifié
  'rdv_done',     -- entretien réalisé
  'wait_decision',-- en attente de décision
  'hired',        -- embauché
  'refused'       -- refusé
);

create type interview_type as enum ('phone', 'video', 'onsite');
create type interview_status as enum ('scheduled', 'done', 'cancelled', 'no_show');

create type document_kind as enum ('cv', 'cover_letter', 'id_card', 'diploma', 'other');

create type message_direction as enum ('outbound', 'inbound');

create table departments (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role app_role not null default 'candidate',
  department_id uuid references departments(id) on delete set null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  department_id uuid references departments(id) on delete set null,
  location text,
  contract_type text,
  is_open boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table candidates (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  email text not null,
  full_name text not null,
  phone text,
  birth_date date,
  nrn text,
  address text,
  city text,
  postal_code text,
  country text default 'BE',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_candidates_email on candidates (lower(email));

create table applications (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  status application_status not null default 'new',
  rating smallint check (rating between 0 and 5),
  assigned_manager uuid references profiles(id) on delete set null,
  motivation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_applications_status on applications (status);
create index idx_applications_job on applications (job_id);
create index idx_applications_manager on applications (assigned_manager);

create table interviews (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_min integer not null default 30,
  type interview_type not null default 'onsite',
  status interview_status not null default 'scheduled',
  location text,
  meeting_url text,
  interviewer uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_interviews_application on interviews (application_id);
create index idx_interviews_when on interviews (scheduled_at);

create table notes (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notes_application on notes (application_id);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  direction message_direction not null,
  subject text,
  body text not null,
  sender_id uuid references profiles(id) on delete set null,
  email_provider_id text,
  created_at timestamptz not null default now()
);
create index idx_messages_application on messages (application_id);

create table documents (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  kind document_kind not null default 'other',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_documents_application on documents (application_id);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
create trigger trg_jobs_updated before update on jobs
  for each row execute function set_updated_at();
create trigger trg_candidates_updated before update on candidates
  for each row execute function set_updated_at();
create trigger trg_applications_updated before update on applications
  for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'candidate'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter publication supabase_realtime add table applications;
alter publication supabase_realtime add table interviews;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table messages;

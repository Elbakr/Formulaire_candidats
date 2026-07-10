-- Karim 2026-07-10 (Phase 3 tablette) : DÉCLARATION DU SITE DU JOUR.
--
-- Sur la tablette partagée, le travailleur signale à quel site (magasin) il est
-- affecté AUJOURD'HUI. Cette table est CENTRALE : toutes les tablettes de tous
-- les magasins lisent/écrivent ici -> l'état est synchrone et identique partout,
-- en temps réel. Une seule ligne par (travailleur, jour) : re-signaler écrase.
--
-- Usage aval :
--   * heure de FIN du jour = fermeture du site déclaré (closing_time dérivé)
--   * échelonnement des pauses (qui est où aujourd'hui)
--   * tableau live "qui est déjà où" affiché sur chaque tablette.

create table if not exists public.tablet_site_declarations (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  work_date    date not null,
  site_code    text not null,               -- A,B,C,D,E,F (cf. src/lib/city.ts)
  city         text not null,               -- 'bruxelles' | 'anvers'
  closing_time text,                         -- "HH:MM" fermeture dérivée du site/jour
  source       text not null default 'tablet',
  declared_at  timestamptz not null default now(),
  unique (employee_id, work_date)            -- 1 site par travailleur par jour (upsert)
);

create index if not exists idx_tsd_date_site on public.tablet_site_declarations (work_date, site_code);
create index if not exists idx_tsd_date_city on public.tablet_site_declarations (work_date, city);

-- Accès uniquement via service-role (server actions). RLS activée sans policy
-- publique : aucune lecture/écriture directe depuis le client anon.
alter table public.tablet_site_declarations enable row level security;

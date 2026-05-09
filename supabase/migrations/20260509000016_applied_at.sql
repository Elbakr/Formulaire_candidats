-- applied_at : vraie date de candidature (vs created_at = date d'import)
-- Pour les 1809 candidatures Gravity Forms importées, leur created_at est la date d'import.
-- La vraie date est dans raw_payload.date_created. On la rapatrie ici.

alter table candidates add column if not exists applied_at timestamptz;

-- Backfill : pour tous les candidats, applied_at = raw_payload.date_created (si dispo) sinon created_at
update candidates
set applied_at = coalesce(
  case
    when raw_payload->>'date_created' is not null
      then (raw_payload->>'date_created')::timestamptz
    else null
  end,
  created_at
)
where applied_at is null;

-- Désormais applied_at est NOT NULL avec default
alter table candidates alter column applied_at set default now();
alter table candidates alter column applied_at set not null;

create index if not exists idx_candidates_applied_at on candidates (applied_at desc);

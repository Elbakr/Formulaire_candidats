-- Vague 6.b — Jours fériés religieux + internationaux
--
-- Étend le module fériés (cf 20260620000020) pour intégrer les dates
-- internationales et religieuses, particulièrement importantes pour Caftan
-- Factory : Aïd al-Fitr, Aïd al-Adha, Mawlid, Achoura, début Ramadan, etc.
--
-- - Ajoute les valeurs `religious` et `international` à l'enum `holiday_kind`
-- - Ajoute une colonne `priority` (0..3) pour mettre en avant certaines dates
-- - Idempotente.

do $$ begin
  begin
    alter type holiday_kind add value if not exists 'religious';
  exception when duplicate_object then null;
  end;
  begin
    alter type holiday_kind add value if not exists 'international';
  exception when duplicate_object then null;
  end;
end $$;

alter table holidays add column if not exists priority smallint not null default 0;
alter table holidays add column if not exists tradition text;
-- tradition : 'islamic' | 'christian' | 'jewish' | 'civil' | 'secular' | null

create index if not exists idx_holidays_kind     on holidays (kind);
create index if not exists idx_holidays_priority on holidays (priority desc);

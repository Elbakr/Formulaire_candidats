-- Karim 15/05/2026 : centralisation des regles de l autoplaner dans
-- org_settings.autoplaner_rules (JSONB). Chaque cle = id_de_la_regle,
-- valeur = boolean (active/desactivee). Les defauts sont definis cote
-- application (caftan-rh/src/lib/autoplaner-rules.ts).

begin;

alter table org_settings
  add column if not exists autoplaner_rules jsonb not null default '{}'::jsonb;

commit;

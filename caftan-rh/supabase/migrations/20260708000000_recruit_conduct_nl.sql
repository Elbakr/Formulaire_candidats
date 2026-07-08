-- Karim 2026-07-08 : traductions NÉERLANDAISES du référentiel « conduite & erreurs
-- de débutant » (recruit_conduct_items). Colonnes NL nullable ; fallback FR côté
-- app quand la valeur NL est vide/null. Idempotent (add column if not exists).
alter table public.recruit_conduct_items add column if not exists category_nl text;
alter table public.recruit_conduct_items add column if not exists title_nl text;
alter table public.recruit_conduct_items add column if not exists description_nl text;
alter table public.recruit_conduct_items add column if not exists phase_nl text;

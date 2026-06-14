-- Karim 2026-06-14 : colonne `data` (jsonb) sur incidents pour porter
-- l'explication riche par incident (data.explain : who/event/what/why/remedies)
-- affichee sur l'ecran QCM, et le flag `training`. Sans elle, l'ecran incident
-- (qui SELECT data) plantait et le seeder d'entrainement echouait.
-- Idempotente.

alter table public.incidents add column if not exists data jsonb;

notify pgrst, 'reload schema';

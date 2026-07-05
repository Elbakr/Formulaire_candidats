-- Karim 2026-07-05 : heures étudiant DÉJÀ consommées en 2026 (contingent ~600h/an).
-- Saisi par le candidat étudiant, transmis au secrétariat social.
alter table public.candidates add column if not exists student_hours_used_2026 integer;

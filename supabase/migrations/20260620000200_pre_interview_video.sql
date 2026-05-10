-- Module Pré-entretien — Volet vidéo (V2)
-- Ajoute le support des questions vidéo + bucket Supabase Storage privé + purge RGPD.
-- Idempotent. Ne touche pas au flow V1 écrit si aucune question vidéo n'est activée.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Étendre pre_interview_questions : durée max vidéo
--    `kind` reste un text simple (pas de check existant) → on peut y écrire 'video'.
-- ─────────────────────────────────────────────────────────────────────────────

alter table pre_interview_questions
  add column if not exists video_max_seconds int default 90;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Étendre pre_interview_responses : storage path + durée + purge
-- ─────────────────────────────────────────────────────────────────────────────

alter table pre_interview_responses
  add column if not exists video_storage_path text;
alter table pre_interview_responses
  add column if not exists video_duration_sec int;
alter table pre_interview_responses
  add column if not exists video_purge_after timestamptz;

create index if not exists idx_pre_r_video_purge
  on pre_interview_responses (video_purge_after)
  where video_storage_path is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Bucket privé pour les vidéos
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('pre-interview-videos', 'pre-interview-videos', false)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS storage policies
--    - upload : aucun auth requis (le candidat n'a pas de session).
--      La sécurité repose UNIQUEMENT sur la connaissance du token (path = {token}/{question_id}.webm).
--    - read  : RH/manager via signed URLs (admin client côté server action).
--    - delete : RH/admin uniquement.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  begin
    drop policy if exists "piv_token_upload" on storage.objects;
    create policy "piv_token_upload" on storage.objects
      for insert
      with check (bucket_id = 'pre-interview-videos');

    drop policy if exists "piv_rh_read" on storage.objects;
    create policy "piv_rh_read" on storage.objects
      for select using (
        bucket_id = 'pre-interview-videos'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin','rh','manager')
        )
      );

    drop policy if exists "piv_rh_delete" on storage.objects;
    create policy "piv_rh_delete" on storage.objects
      for delete using (
        bucket_id = 'pre-interview-videos'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin','rh')
        )
      );
  exception when others then
    raise notice 'Storage policy creation skipped: %', SQLERRM;
  end;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Seed de questions vidéo — désactivées par défaut (is_active=false)
--    Le RH les active via /admin/pre-interview/questions quand il veut.
-- ─────────────────────────────────────────────────────────────────────────────

insert into pre_interview_questions (
  slug, position_role, language_code, prompt, kind, choices,
  min_chars, max_chars, is_required, sort_order, is_active, video_max_seconds
)
values
  ('video_intro_60s', 'all', 'fr',
   'Présente-toi en 60 secondes (qui tu es, ton expérience boutique, pourquoi Caftan Factory)',
   'video', null, 0, 0, false, 200, false, 60),

  ('video_situation_difficile', 'all', 'fr',
   'Une cliente entre, énervée car son caftan a un défaut. Comment tu réagis ?',
   'video', null, 0, 0, false, 210, false, 90),

  ('video_languages_check', 'all', 'fr',
   'Présente-toi en 30 sec en NL ou en AR (au choix)',
   'video', null, 0, 0, false, 220, false, 45)
on conflict (slug) do nothing;

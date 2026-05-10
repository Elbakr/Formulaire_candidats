-- Préférence de langue de l'utilisateur (FR/NL).
-- Utilisée par les pages /me/* et la page candidat publique.
-- Idempotent : add column + check constraint guardés. Templates email NL
-- uniquement insérés si absents.

alter table profiles
  add column if not exists language_preference text default 'fr';

-- Add the CHECK constraint only if it doesn't already exist.
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'profiles'
      and constraint_name = 'profiles_language_preference_check'
  ) then
    alter table profiles
      add constraint profiles_language_preference_check
      check (language_preference in ('fr', 'nl'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Templates email NL pour le pré-entretien
-- (FR seed déjà géré dans 20260620000090_pre_interview.sql).
-- ─────────────────────────────────────────────────────────────────────────────

insert into email_templates (slug, label, category, subject, body_html, needs_dates, needs_times, is_active)
values
  ('pre_interview_invite_nl',
   'Uitnodiging schriftelijk pre-interview',
   'pre_interview',
   'Pre-interview — Caftan Factory',
   '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:600px">
<p>Beste {{firstname}},</p>
<p>Bedankt voor uw sollicitatie bij <b>Caftan Factory</b>. Uw profiel interesseert ons.</p>
<p>Voorafgaand aan een fysiek gesprek nodigen we u uit voor een kort <b>schriftelijk pre-interview</b> (5 tot 10 minuten). Zo kunnen we onze ontmoeting beter voorbereiden.</p>
<p style="margin:20px 0;text-align:center">
  <a href="{{link}}" style="display:inline-block;background:#c8a96e;color:#1a1a0d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">
    Pre-interview beantwoorden
  </a>
</p>
<p style="font-size:12px;color:#666">De link is geldig tot <b>{{deadline}}</b>. Uw antwoorden worden automatisch bewaard, u kunt later terugkomen.</p>
<p>{{custom}}</p>
<hr style="border:none;border-top:1px solid #e8e6e0;margin:14px 0">
<p style="font-size:13px;margin:0">Met vriendelijke groet,<br><b>Het HR-team — {{org_name}}</b></p>
</div>',
   false, false, true),

  ('pre_interview_relance_nl',
   'Herinnering pre-interview D+3',
   'pre_interview',
   'Herinnering — uw pre-interview Caftan Factory',
   '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:600px">
<p>Beste {{firstname}},</p>
<p>We hebben uw antwoorden op het pre-interview nog niet ontvangen. De link blijft geldig tot <b>{{deadline}}</b>.</p>
<p style="margin:20px 0;text-align:center">
  <a href="{{link}}" style="display:inline-block;background:#c8a96e;color:#1a1a0d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">
    Nu antwoorden (5 min)
  </a>
</p>
<p>Indien u niet langer geïnteresseerd bent, kunt u dit bericht negeren.</p>
<hr style="border:none;border-top:1px solid #e8e6e0;margin:14px 0">
<p style="font-size:13px;margin:0">Met vriendelijke groet,<br><b>Het HR-team — {{org_name}}</b></p>
</div>',
   false, false, true),

  ('pre_interview_reserve_nl',
   'In reserve (pre-interview niet voltooid)',
   'pre_interview',
   'Uw sollicitatie — Caftan Factory',
   '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:600px">
<p>Beste {{firstname}},</p>
<p>De termijn om te antwoorden op het pre-interview is verstreken. We plaatsen uw sollicitatie <b>in reserve</b>.</p>
<p>Indien uw situatie is gewijzigd en u het proces wilt hervatten, antwoord eenvoudig op deze e-mail — we sturen u dan opnieuw de link.</p>
<hr style="border:none;border-top:1px solid #e8e6e0;margin:14px 0">
<p style="font-size:13px;margin:0">Met vriendelijke groet,<br><b>Het HR-team — {{org_name}}</b></p>
</div>',
   false, false, true)
on conflict (slug) do nothing;

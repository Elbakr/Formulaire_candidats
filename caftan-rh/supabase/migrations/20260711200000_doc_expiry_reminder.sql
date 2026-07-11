-- Karim 2026-07-11 : rappel d'expiration du titre de séjour / CI, VALIDÉ par
-- l'admin avant envoi (jamais auto). `residence_doc_reminder_at` = date d'envoi
-- effectif du rappel au travailleur (null = pas encore envoyé). Le cron
-- doc-expiry-scan notifie l'admin 45 j avant l'expiration pour qu'il valide.
alter table public.employees
  add column if not exists residence_doc_reminder_at timestamptz;

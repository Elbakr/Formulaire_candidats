-- Karim 2026-06-17 : demande de rupture par le travailleur — case « arrêt au
-- plus tôt si l'organisation peut l'absorber sans préjudice ». Si cochée, l'admin
-- décide à son appréciation (date immédiate ou la plus proche possible) ; sinon la
-- fin prend effet à la date de demande + 3 jours planifiés (ou +4 si pas de planning).
alter table public.contract_terminations
  add column if not exists immediate_requested boolean not null default false;

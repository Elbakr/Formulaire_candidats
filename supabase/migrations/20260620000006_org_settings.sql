-- Pause prière vendredi (été/hiver) - paramètres org
-- Anciennement FRIDAY_PAUSE_WINTER 12:55-13:45 et FRIDAY_PAUSE_SUMMER 13:55-14:45
-- avec détection auto via dates DST (avril → octobre par défaut).

alter table org_settings
  add column if not exists prayer_pause_enabled boolean default true,
  add column if not exists prayer_pause_summer text default '13:55-14:45',
  add column if not exists prayer_pause_winter text default '12:55-13:45',
  add column if not exists prayer_pause_dst_start text default '04-01',
  add column if not exists prayer_pause_dst_end text default '10-01';

-- Karim 2026-07-12 : VERROUILLAGE MATÉRIEL par appareil. À la 1re ouverture, la
-- tablette s'enrôle : un SECRET d'appareil est posé en cookie httpOnly sur CET
-- appareil, et son EMPREINTE (sha256) est stockée ici. Ensuite, le lien /t/<jeton>
-- n'est accepté QUE depuis l'appareil enrôlé (cookie qui correspond à l'empreinte) ;
-- copié sur un autre appareil -> refusé. L'admin peut « réinitialiser l'appareil »
-- (efface l'empreinte) pour ré-enrôler une nouvelle tablette (remplacement/perte).

alter table public.tablet_devices
  add column if not exists bound_secret text,      -- sha256(secret d'appareil), NULL = pas encore enrôlée
  add column if not exists bound_at timestamptz;   -- date d'enrôlement

-- Référentiel communes belges avec coordonnées GPS approximatives (centroïdes).
-- Sert au scoring distance candidat ↔ magasins et au tri des employés
-- proches d'un site lors d'une demande de renfort.
--
-- Idempotente.

create table if not exists be_postcodes (
  postcode text primary key,
  name text not null,
  region text not null, -- 'BRU' | 'WAL' | 'FLA'
  province text,
  lat numeric(8,5) not null,
  lng numeric(8,5) not null
);
create index if not exists idx_be_postcodes_region on be_postcodes (region);

alter table be_postcodes enable row level security;
drop policy if exists be_postcodes_read on be_postcodes;
drop policy if exists be_postcodes_admin on be_postcodes;
create policy be_postcodes_read on be_postcodes for select using (true);
create policy be_postcodes_admin on be_postcodes for all using (is_rh()) with check (is_rh());

-- Coordonnées des magasins (override via env si besoin)
alter table sites add column if not exists lat numeric(8,5);
alter table sites add column if not exists lng numeric(8,5);

-- Update les magasins clés (centroïdes approximatifs des adresses fournies).
update sites set lat = 50.8729, lng = 4.3667 where code = 'A'; -- Schaerbeek (Brabant)
update sites set lat = 50.8553, lng = 4.3327 where code = 'B'; -- Molenbeek (Ransfort)
update sites set lat = 51.2147, lng = 4.4202 where code = 'C'; -- Antwerpen (Lange Kievitstraat)
update sites set lat = 50.8729, lng = 4.3667 where code = 'D'; -- Bxl entrepôt
update sites set lat = 50.8553, lng = 4.3327 where code = 'E'; -- Online (centre Bxl)
update sites set lat = 51.2147, lng = 4.4202 where code = 'F'; -- Anvers events

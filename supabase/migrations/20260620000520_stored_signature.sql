-- Karim 2026-05-29 : signature stockee de facon permanente pour les
-- representants employeur (Karim Elbazi pour AMD Megastore / Caftan Factory).
-- Permet de pre-signer les contrats avant envoi a l employee (Karim n a
-- plus besoin de signer chaque contrat manuellement).

alter table public.profiles
  add column if not exists signature_data_url text,
  add column if not exists signature_updated_at timestamptz;

-- Index pour lookup rapide (rare mais safe)
create index if not exists idx_profiles_has_signature
  on public.profiles((signature_data_url is not null))
  where signature_data_url is not null;

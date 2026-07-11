-- Karim 2026-07-11 : documents de détachement dans la valise. Ajoute les types
-- 'limosa' (L1) et 'a1' à l'enum document_kind.
alter type public.document_kind add value if not exists 'limosa';
alter type public.document_kind add value if not exists 'a1';

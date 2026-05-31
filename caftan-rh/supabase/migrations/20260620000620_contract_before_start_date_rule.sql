-- Karim 2026-05-30 : rule contrat signé AVANT date début (sinon CDI)
insert into public.legal_rules (slug, name, description, category, severity, parameters, legal_ref) values
  ('contract_before_start_date_block', 'Contrat signé avant date début',
   'BLOQUE l envoi d un contrat non signe si start_date < today. Derogation admin uniquement.',
   'embauche', 'block', '{}', 'Loi 3 juillet 1978 art. 9')
on conflict (slug) do nothing;

-- Karim 2026-05-30 : nouvelle rule legale - contrat doit etre signe AVANT
-- date de debut (sinon devient CDI selon loi belge 1978).

insert into public.legal_rules (slug, name, description, category, severity, parameters, legal_ref) values
  ('contract_before_start_date_block', 'Contrat signé avant date début',
   'BLOQUE l envoi d un contrat non signe si la date de debut est dans le passe (sinon requalification CDI). Derogation possible uniquement par role=admin en desactivant cette rule temporairement.',
   'embauche', 'block', '{}', 'Loi 3 juillet 1978 art. 9')
on conflict (slug) do nothing;

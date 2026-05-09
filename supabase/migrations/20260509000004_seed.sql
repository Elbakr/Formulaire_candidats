-- Seed initial : départements + offres exemple
insert into departments (name) values
  ('Boutique'),
  ('Atelier couture'),
  ('Logistique'),
  ('Administration')
on conflict (name) do nothing;

insert into jobs (title, description, location, contract_type, is_open) values
  ('Vendeur·se boutique', 'Accueil clientèle, conseil produit, encaissement.', 'Bruxelles', 'CDI', true),
  ('Couturier·ère', 'Confection et retouche de caftans haut de gamme.', 'Anderlecht', 'CDI', true),
  ('Magasinier·ère', 'Réception, préparation commandes, gestion stock.', 'Bruxelles', 'CDD', true)
on conflict do nothing;

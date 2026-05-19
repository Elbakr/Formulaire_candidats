-- Karim 19/05 : tracabilite des shifts generes par le solver.
-- Pour chaque shift cree automatiquement, on stocke une note explicative
-- ("pourquoi/comment") visible cote RH dans le ShiftDialog au clic.

alter table shifts add column if not exists generation_note text;

comment on column shifts.generation_note is
  'Note explicative remplie par le solver lors de la generation (phase 1 contractuel, phase 2 OT, renfort cross-site). Inclut : source, multiplicateurs appliques, choix du site/employe, raisons du tri. Null pour les shifts crees manuellement.';

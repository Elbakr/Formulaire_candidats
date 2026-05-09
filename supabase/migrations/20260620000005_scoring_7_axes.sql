-- Évaluations à 7 axes (au lieu de 5)
-- Ancien recrutement.html EVAL_CRIT : ponctualite, presentation, communication, motivation, experience, polyvalence, disponibilite
-- Nouvelle moyenne = somme / nombre d'axes RENSEIGNÉS (NULL-safe).
-- Compatibilité ascendante : les anciennes évaluations à 5 axes (fiabilite, autonomie, esprit_equipe, qualite, presentation)
-- continuent à fonctionner — leur total sera la moyenne des axes effectivement saisis.

create or replace function eval_total() returns trigger as $$
declare
  axes text[] := array[
    -- 7 nouveaux axes (Discovery section 1.6)
    'ponctualite', 'presentation', 'communication',
    'motivation', 'experience', 'polyvalence', 'disponibilite',
    -- 5 anciens axes (legacy, pour évaluations existantes)
    'fiabilite', 'autonomie', 'esprit_equipe', 'qualite'
  ];
  k text;
  v numeric;
  sum_val numeric := 0;
  count_val int := 0;
begin
  foreach k in array axes loop
    v := nullif(new.scores->>k, '')::numeric;
    if v is not null then
      sum_val := sum_val + v;
      count_val := count_val + 1;
    end if;
  end loop;
  if count_val > 0 then
    new.total := round(sum_val / count_val, 2);
  else
    new.total := 0;
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger réutilise la même fonction : pas besoin de le recréer.

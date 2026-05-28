-- Karim 2026-05-20 : manager/RH/admin doit pouvoir creer un time_off_request
-- pour n importe quel employe (saisie d urgence depuis la fiche RH). La policy
-- existante 'timeoff_self_create' n autorise que l employe a creer pour
-- lui-meme. On ajoute 'timeoff_manager_create' qui s appuie sur is_manager()
-- (helper existant qui couvre admin/rh/manager).

drop policy if exists timeoff_manager_create on time_off_requests;

create policy timeoff_manager_create on time_off_requests
  for insert
  to authenticated
  with check (is_manager());

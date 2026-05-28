-- Karim 2026-05-21 : garde-fou DB anti-chevauchement sur site_assignments.
-- Empeche definitivement la creation de 2 affectations ACTIVES en meme
-- temps pour un meme couple (employee_id, site_id). Tout INSERT ou UPDATE
-- qui creerait un chevauchement est rejete avec un message clair.
-- Complement de la verification cote server action (defense en profondeur).

create or replace function check_site_assignment_no_overlap()
returns trigger
language plpgsql
as $$
declare
  new_end date := coalesce(NEW.end_date, date '9999-12-31');
  conflict_id uuid;
  conflict_start date;
  conflict_end date;
begin
  select id, start_date, end_date
    into conflict_id, conflict_start, conflict_end
    from site_assignments
   where employee_id = NEW.employee_id
     and site_id = NEW.site_id
     and id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and start_date <= new_end
     and coalesce(end_date, date '9999-12-31') >= NEW.start_date
   limit 1;

  if conflict_id is not null then
    raise exception
      'site_assignments overlap: une affectation existe deja (id=% periode % -> %) pour cet employe sur ce site. Cloture-la ou modifie-la avant d en creer une nouvelle.',
      conflict_id, conflict_start, coalesce(conflict_end::text, 'sans fin')
      using errcode = '23505'; -- unique_violation pour cote client
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_site_assignments_no_overlap on site_assignments;
create trigger trg_site_assignments_no_overlap
  before insert or update on site_assignments
  for each row
  execute function check_site_assignment_no_overlap();

comment on function check_site_assignment_no_overlap is
  'Karim 2026-05-21 : empeche tout chevauchement (employee_id, site_id) sur site_assignments. Rejette INSERT/UPDATE qui croiserait une affectation active du meme couple.';

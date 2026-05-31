-- Karim 2026-05-30 : copie identite candidate vers employee lors embauche

create or replace function public.promote_application_to_employee() returns trigger as $$
declare
  cand record;
  job record;
begin
  if new.status = 'hired' and (old.status is distinct from 'hired') then
    select * into cand from public.candidates where id = new.candidate_id;
    if cand is null then return new; end if;
    if exists (select 1 from public.employees where application_id = new.id) then
      return new;
    end if;
    select * into job from public.jobs where id = new.job_id;
    insert into public.employees (
      profile_id, candidate_id, application_id,
      email, full_name, phone,
      job_title, department_id, manager_id, contract_type,
      start_date,
      iban, bic, bank_holder,
      nrn, birth_date, birth_place,
      address, postal_code, city
    ) values (
      cand.profile_id, cand.id, new.id,
      cand.email, cand.full_name, cand.phone,
      coalesce(job.title, 'À définir'),
      job.department_id,
      new.assigned_manager,
      coalesce(job.contract_type, 'CDI'),
      current_date,
      cand.iban, cand.bic, cand.bank_holder,
      cand.nrn, cand.birth_date, cand.birth_place,
      cand.address, cand.postal_code, cand.city
    );
  end if;
  return new;
end;
$$ language plpgsql;

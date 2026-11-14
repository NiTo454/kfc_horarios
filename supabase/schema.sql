create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  branch_name text not null default 'Tizayuca',
  week_start_date date not null,
  week_end_date date not null,
  original_filename text not null,
  storage_path text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (branch_name, week_start_date)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  role text,
  created_at timestamptz not null default now()
);

create index if not exists employees_full_name_lower_idx
  on public.employees (lower(full_name));

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  start_time time,
  end_time time,
  is_day_off boolean not null default false,
  day_label text,
  unique (schedule_id, employee_id, work_date),
  check (is_day_off or (start_time is not null and end_time is not null))
);

alter table public.shifts add column if not exists day_label text;

alter table public.schedules enable row level security;
alter table public.employees enable row level security;
alter table public.shifts enable row level security;

drop policy if exists "Authenticated users can view schedules" on public.schedules;
create policy "Authenticated users can view schedules"
  on public.schedules for select to authenticated using (true);

drop policy if exists "Authenticated users can view employees" on public.employees;
create policy "Authenticated users can view employees"
  on public.employees for select to authenticated using (true);

drop policy if exists "Authenticated users can view shifts" on public.shifts;
create policy "Authenticated users can view shifts"
  on public.shifts for select to authenticated using (true);

grant select on public.schedules, public.employees, public.shifts to authenticated;
grant select on public.schedules to service_role;

create or replace function public.publish_schedule(
  p_branch_name text,
  p_week_start_date date,
  p_week_end_date date,
  p_original_filename text,
  p_storage_path text,
  p_uploaded_by uuid,
  p_employees jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schedule_id uuid;
  v_employee_id uuid;
  v_employee record;
  v_shift record;
begin
  if p_week_end_date < p_week_start_date then
    raise exception 'La fecha final debe ser posterior o igual a la inicial.';
  end if;
  if jsonb_typeof(p_employees) <> 'array' or jsonb_array_length(p_employees) = 0 then
    raise exception 'El horario no contiene trabajadores.';
  end if;

  insert into public.schedules (
    branch_name, week_start_date, week_end_date, original_filename, storage_path, uploaded_by
  )
  values (
    p_branch_name, p_week_start_date, p_week_end_date, p_original_filename, p_storage_path, p_uploaded_by
  )
  on conflict (branch_name, week_start_date) do update
    set week_end_date = excluded.week_end_date,
        original_filename = excluded.original_filename,
        storage_path = excluded.storage_path,
        uploaded_by = excluded.uploaded_by,
        created_at = now()
  returning id into v_schedule_id;

  delete from public.shifts where schedule_id = v_schedule_id;

  for v_employee in
    select full_name, role, shifts
    from jsonb_to_recordset(p_employees) as item(full_name text, role text, shifts jsonb)
  loop
    if v_employee.full_name is null or length(trim(v_employee.full_name)) = 0 then
      raise exception 'El horario contiene un trabajador sin nombre.';
    end if;

    select id into v_employee_id
    from public.employees
    where lower(full_name) = lower(trim(v_employee.full_name))
    order by created_at
    limit 1;

    if v_employee_id is null then
      insert into public.employees (full_name, role)
      values (trim(v_employee.full_name), v_employee.role)
      returning id into v_employee_id;
    elsif v_employee.role is not null then
      update public.employees
      set role = coalesce(role, v_employee.role)
      where id = v_employee_id;
    end if;

    for v_shift in
      select work_date, start_time, end_time, is_day_off, day_label
      from jsonb_to_recordset(v_employee.shifts)
        as item(work_date date, start_time time, end_time time, is_day_off boolean, day_label text)
    loop
      if v_shift.work_date < p_week_start_date or v_shift.work_date > p_week_end_date then
        raise exception 'Un turno está fuera del rango de la semana.';
      end if;
      if not v_shift.is_day_off and (v_shift.start_time is null or v_shift.end_time is null) then
        raise exception 'Un turno no contiene horas de inicio y fin.';
      end if;

      insert into public.shifts (
        schedule_id, employee_id, work_date, start_time, end_time, is_day_off, day_label
      )
      values (
        v_schedule_id, v_employee_id, v_shift.work_date, v_shift.start_time,
        v_shift.end_time, v_shift.is_day_off, v_shift.day_label
      );
    end loop;
  end loop;

  return v_schedule_id;
end;
$$;

revoke all on function public.publish_schedule(text, date, date, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.publish_schedule(text, date, date, text, text, uuid, jsonb) to service_role;

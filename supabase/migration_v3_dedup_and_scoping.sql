-- ============================================================================
-- SABIS® Event Management System — v3 Migration
-- 1. Event-specific authorization (allowed_event_ids) for School Dashboard & Gate Control
-- 2. Duplicate registration prevention + self-service Edit Registration RPCs
-- Safe to run on your existing Supabase database (preserves all existing data!)
-- ============================================================================

-- 1. Add event-level authorization array to authorized_users
alter table public.authorized_users
  add column if not exists allowed_event_ids text[] not null default '{}';

-- Backfill existing School Dashboard ('regular') & Gate Control ('gate') users
-- with currently existing events so no active staff lose access before you narrow them
update public.authorized_users
set allowed_event_ids = coalesce((select array_agg(id) from public.events), '{}')
where role in ('regular', 'gate')
  and coalesce(array_length(allowed_event_ids, 1), 0) = 0;

-- 2. Helper function checking event-level access (Control Admins always have full access)
create or replace function public.can_access_event(target_event_id text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and active = true
      and (
        role = 'control'
        or target_event_id = any(coalesce(allowed_event_ids, '{}'))
      )
  );
$$;

-- 3. Enforce event-scoped RLS on registrations, attendee_passes, and scan_logs
drop policy if exists "Staff can read all registrations" on public.registrations;
create policy "Staff can read authorized event registrations" on public.registrations
  for select using (public.can_access_event(event_id));

drop policy if exists "Staff can read all passes" on public.attendee_passes;
create policy "Staff can read authorized event passes" on public.attendee_passes
  for select using (public.can_access_event(event_id));

drop policy if exists "Gate and control can update passes" on public.attendee_passes;
create policy "Gate and control can update authorized event passes" on public.attendee_passes
  for update using (
    public.current_user_role() in ('control', 'gate')
    and public.can_access_event(event_id)
  );

drop policy if exists "All authenticated staff can read scan logs" on public.scan_logs;
create policy "Staff can read authorized event scan logs" on public.scan_logs
  for select using (public.can_access_event(event_id));

drop policy if exists "Gate and control can insert scan logs" on public.scan_logs;
create policy "Gate and control can insert authorized event scan logs" on public.scan_logs
  for insert with check (
    public.current_user_role() in ('control', 'gate')
    and public.can_access_event(event_id)
  );

-- 4. Public RPC: Lookup existing registration for an event (prevents duplicates & enables editing)
create or replace function public.lookup_existing_registration(
  p_event_id text,
  p_parent_number text default '',
  p_email text default '',
  p_phone text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.registrations%rowtype;
  v_passes jsonb;
  v_pnum text := upper(trim(coalesce(p_parent_number, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v_pnum = '' and v_email = '' and length(v_phone_digits) < 6 then
    return null;
  end if;

  select *
  into v_reg
  from public.registrations r
  where r.event_id = p_event_id
    and (
      (v_pnum <> '' and upper(trim(r.parent_number)) = v_pnum)
      or (v_email <> '' and lower(trim(r.email)) = v_email)
      or (length(v_phone_digits) >= 6 and regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') = v_phone_digits)
    )
  order by r.registered_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.pass_index asc), '[]'::jsonb)
  into v_passes
  from public.attendee_passes p
  where p.registration_id = v_reg.id;

  return jsonb_build_object(
    'registration', to_jsonb(v_reg),
    'passes', v_passes
  );
end;
$$;

-- 5. Public RPC: Update existing registration & synchronize attendee QR passes (preserves USED passes)
create or replace function public.update_existing_registration(
  p_registration_id text,
  p_event_id text,
  p_payload jsonb,
  p_passes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.registrations%rowtype;
  v_used_count int;
  v_new_party_size int;
  v_pass_item jsonb;
  v_idx int;
  v_code text;
  v_passes jsonb;
begin
  select * into v_existing
  from public.registrations
  where id = p_registration_id and event_id = p_event_id;

  if not found then
    raise exception 'Registration not found for this event';
  end if;

  v_new_party_size := greatest(1, least(20, coalesce((p_payload ->> 'party_size')::int, v_existing.party_size)));

  select count(*) into v_used_count
  from public.attendee_passes
  where registration_id = p_registration_id and status = 'USED';

  if v_new_party_size < v_used_count then
    raise exception 'Cannot reduce attendees below % already checked-in pass(es)', v_used_count;
  end if;

  update public.registrations
  set
    parent_number = coalesce(p_payload ->> 'parent_number', parent_number),
    name = coalesce(p_payload ->> 'name', name),
    phone = coalesce(p_payload ->> 'phone', phone),
    email = coalesce(p_payload ->> 'email', email),
    school_type = coalesce(p_payload ->> 'school_type', school_type),
    school_branch = coalesce(p_payload ->> 'school_branch', school_branch),
    school_other = coalesce(p_payload ->> 'school_other', school_other),
    party_size = v_new_party_size,
    attendee_ages = coalesce(p_payload -> 'attendee_ages', attendee_ages),
    other_attendees = coalesce(p_payload -> 'other_attendees', other_attendees),
    notes = coalesce(p_payload ->> 'notes', notes),
    delivery_mode = coalesce(p_payload ->> 'delivery_mode', delivery_mode),
    delivery_status = coalesce(p_payload ->> 'delivery_status', delivery_status)
  where id = p_registration_id;

  -- Upsert passes 1..v_new_party_size without overwriting status/used_at on existing passes
  for v_pass_item in select * from jsonb_array_elements(coalesce(p_passes, '[]'::jsonb))
  loop
    v_idx := (v_pass_item ->> 'pass_index')::int;
    v_code := v_pass_item ->> 'pass_code';

    insert into public.attendee_passes (
      pass_code, event_id, registration_id, pass_index, total_passes,
      attendee_label, attendee_age, attendee_contact, status
    )
    values (
      v_code,
      p_event_id,
      p_registration_id,
      v_idx,
      v_new_party_size,
      coalesce(v_pass_item ->> 'attendee_label', ''),
      coalesce(v_pass_item ->> 'attendee_age', ''),
      coalesce(v_pass_item ->> 'attendee_contact', ''),
      'PENDING'
    )
    on conflict (pass_code) do update
    set
      total_passes = v_new_party_size,
      attendee_label = excluded.attendee_label,
      attendee_age = excluded.attendee_age,
      attendee_contact = excluded.attendee_contact;
  end loop;

  -- Remove extra PENDING passes if attendee count decreased
  delete from public.attendee_passes
  where registration_id = p_registration_id
    and pass_index > v_new_party_size
    and status = 'PENDING';

  select * into v_existing from public.registrations where id = p_registration_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.pass_index asc), '[]'::jsonb)
  into v_passes
  from public.attendee_passes p
  where p.registration_id = p_registration_id;

  return jsonb_build_object(
    'registration', to_jsonb(v_existing),
    'passes', v_passes
  );
end;
$$;

grant execute on function public.lookup_existing_registration(text, text, text, text) to anon, authenticated;
grant execute on function public.update_existing_registration(text, text, jsonb, jsonb) to anon, authenticated;

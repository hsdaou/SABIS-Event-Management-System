-- ============================================================================
-- SABIS® Event Management System — Full Supabase Schema (v2 Multi-Event)
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. EVENTS (Created & managed ONLY by Control Admins)
create table if not exists public.events (
  id text primary key,
  slug text unique not null,
  name text not null,
  event_date text not null default '',
  qr_delivery_mode text not null default 'on_screen' check (qr_delivery_mode in ('on_screen', 'contact_info')),
  contact_delivery_channel text not null default 'both' check (contact_delivery_channel in ('email', 'phone', 'both')),
  strict_gate_mode boolean not null default false,
  field_toggles jsonb not null default '{
    "parentNumber": true,
    "fullName": true,
    "phone": true,
    "email": true,
    "numAttendees": true,
    "school": true,
    "attendeeAges": true,
    "otherAttendeeContacts": true
  }'::jsonb,
  required_fields jsonb not null default '{
    "phone": true,
    "email": true
  }'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.events (id, slug, name, event_date)
values ('evt-default', 'sabis-parent-event', 'SABIS® Annual Parent & Student Event', '2026-11-22')
on conflict (id) do nothing;

-- 2. VENUES (Scoped per event; capacity hidden on Regular Dashboard)
create table if not exists public.venues (
  id text primary key,
  event_id text not null default 'evt-default',
  slug text not null,
  name text not null,
  capacity int not null default 100,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_venues_event_slug on public.venues(event_id, slug);

insert into public.venues (id, event_id, slug, name, capacity, sort_order) values
  ('GATE-A', 'evt-default', 'gate-a-main-campus-entrance', 'Gate A - Main Campus Entrance', 150, 1),
  ('GATE-B', 'evt-default', 'gate-b-auditorium-stage', 'Gate B - Auditorium & Stage', 120, 2),
  ('GATE-C', 'evt-default', 'gate-c-primary-section-gate', 'Gate C - Primary Section Gate', 100, 3),
  ('GATE-D', 'evt-default', 'gate-d-sports-exhibition-hall', 'Gate D - Sports & Exhibition Hall', 100, 4)
on conflict (id) do nothing;

-- 3. AUTHORIZED USERS (Control Admin, Tier 1 Regular Dashboard, Tier 2 Gate Control)
create table if not exists public.authorized_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null default '',
  role text not null check (role in ('control', 'regular', 'gate')),
  active boolean not null default true,
  added_by text default 'system',
  created_at timestamptz not null default now()
);

insert into public.authorized_users (email, full_name, role, added_by)
values ('admin@sabis-events.edu', 'SABIS Control Admin', 'control', 'system')
on conflict (email) do nothing;

-- 4. REGISTRATIONS
create table if not exists public.registrations (
  id text primary key,
  event_id text not null default 'evt-default',
  parent_number text not null default '',
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  school_type text not null default '',
  school_branch text not null default '',
  school_other text not null default '',
  category text not null default 'Parent',
  assigned_gate text not null,
  party_size int not null default 1 check (party_size >= 1 and party_size <= 20),
  attendee_ages jsonb not null default '[]'::jsonb,
  other_attendees jsonb not null default '[]'::jsonb,
  notes text not null default '',
  delivery_mode text not null default 'on_screen',
  delivery_status text not null default 'displayed',
  registered_at timestamptz not null default now()
);

create index if not exists idx_registrations_event on public.registrations(event_id);
create index if not exists idx_registrations_gate on public.registrations(assigned_gate);

-- 5. ATTENDEE PASSES (1 unique QR per attendee)
create table if not exists public.attendee_passes (
  pass_code text primary key,
  event_id text not null default 'evt-default',
  registration_id text not null references public.registrations(id) on delete cascade,
  pass_index int not null,
  total_passes int not null,
  attendee_label text not null default '',
  attendee_age text not null default '',
  attendee_contact text not null default '',
  status text not null default 'PENDING' check (status in ('PENDING', 'USED')),
  used_at timestamptz,
  used_gate text,
  scanned_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendee_passes_event on public.attendee_passes(event_id);
create index if not exists idx_attendee_passes_reg on public.attendee_passes(registration_id);

-- 6. SCAN LOGS (Visible to ALL authenticated users)
create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  event_id text not null default 'evt-default',
  scanned_at timestamptz not null default now(),
  pass_code text not null default '',
  registration_id text not null default '',
  parent_number text not null default '',
  attendee_name text not null default '',
  tier text not null default '',
  gate text not null default '',
  status text not null check (status in ('VALID', 'INVALID', 'USED')),
  message text not null default '',
  first_used_at timestamptz,
  scanned_by text not null default ''
);

create index if not exists idx_scan_logs_event on public.scan_logs(event_id);
create index if not exists idx_scan_logs_time on public.scan_logs(scanned_at desc);

-- ============================================================================
-- HELPER FUNCTIONS & RLS POLICIES
-- ============================================================================
create or replace function public.current_user_role()
returns text language sql security definer stable as $$
  select role
  from public.authorized_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and active = true
  limit 1;
$$;

create or replace function public.is_control_admin()
returns boolean language sql security definer stable as $$
  select coalesce(public.current_user_role() = 'control', false);
$$;

create or replace function public.is_any_staff()
returns boolean language sql security definer stable as $$
  select coalesce(public.current_user_role() in ('control', 'regular', 'gate'), false);
$$;

alter table public.events enable row level security;
alter table public.venues enable row level security;
alter table public.authorized_users enable row level security;
alter table public.registrations enable row level security;
alter table public.attendee_passes enable row level security;
alter table public.scan_logs enable row level security;

drop policy if exists "Public can read events" on public.events;
create policy "Public can read events" on public.events for select using (true);
drop policy if exists "Control admin manages events" on public.events;
create policy "Control admin manages events" on public.events for all using (public.is_control_admin()) with check (public.is_control_admin());

drop policy if exists "Public can read venues" on public.venues;
create policy "Public can read venues" on public.venues for select using (true);
drop policy if exists "Control admin can manage venues" on public.venues;
create policy "Control admin can manage venues" on public.venues for all using (public.is_control_admin()) with check (public.is_control_admin());

drop policy if exists "Users can read own authorization" on public.authorized_users;
create policy "Users can read own authorization" on public.authorized_users for select using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_control_admin()
);
drop policy if exists "Control admin manages authorized users" on public.authorized_users;
create policy "Control admin manages authorized users" on public.authorized_users for all using (public.is_control_admin()) with check (public.is_control_admin());

drop policy if exists "Public and staff can create registrations" on public.registrations;
create policy "Public and staff can create registrations" on public.registrations for insert with check (true);
drop policy if exists "Staff can read all registrations" on public.registrations;
create policy "Staff can read all registrations" on public.registrations for select using (public.is_any_staff());
drop policy if exists "Control admin can update or delete registrations" on public.registrations;
create policy "Control admin can update or delete registrations" on public.registrations for update using (public.is_control_admin());
drop policy if exists "Control admin can delete registrations" on public.registrations;
create policy "Control admin can delete registrations" on public.registrations for delete using (public.is_control_admin());

drop policy if exists "Public and staff can create passes" on public.attendee_passes;
create policy "Public and staff can create passes" on public.attendee_passes for insert with check (true);
drop policy if exists "Staff can read all passes" on public.attendee_passes;
create policy "Staff can read all passes" on public.attendee_passes for select using (public.is_any_staff());
drop policy if exists "Gate and control can update passes" on public.attendee_passes;
create policy "Gate and control can update passes" on public.attendee_passes for update using (public.current_user_role() in ('control', 'gate'));
drop policy if exists "Control admin can delete passes" on public.attendee_passes;
create policy "Control admin can delete passes" on public.attendee_passes for delete using (public.is_control_admin());

drop policy if exists "All authenticated staff can read scan logs" on public.scan_logs;
create policy "All authenticated staff can read scan logs" on public.scan_logs for select using (public.is_any_staff());
drop policy if exists "Gate and control can insert scan logs" on public.scan_logs;
create policy "Gate and control can insert scan logs" on public.scan_logs for insert with check (public.current_user_role() in ('control', 'gate'));
drop policy if exists "Control admin can delete scan logs" on public.scan_logs;
create policy "Control admin can delete scan logs" on public.scan_logs for delete using (public.is_control_admin());

-- REALTIME
do $$ begin alter publication supabase_realtime add table public.events; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.venues; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.registrations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.attendee_passes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.scan_logs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.authorized_users; exception when duplicate_object then null; end $$;

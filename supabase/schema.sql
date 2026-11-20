-- ============================================================================
-- SABIS® Event Management System — Supabase PostgreSQL Schema & RLS Policies
-- Run this entire script in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================================

-- Enable UUID generation
create extension if not exists pgcrypto;

-- 1. EVENT SETTINGS (Single-row global configuration controlled ONLY by Control Admins)
create table if not exists public.event_settings (
  id int primary key default 1 check (id = 1),
  event_title text not null default 'SABIS® School Parent Event Registration & Gate Check-In',
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
  updated_at timestamptz not null default now()
);

insert into public.event_settings (id) values (1) on conflict (id) do nothing;

-- 2. VENUES (Controlled ONLY by Control Admins; capacity is hidden on Regular Dashboard)
create table if not exists public.venues (
  id text primary key,
  slug text unique not null,
  name text not null,
  capacity int not null default 100,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.venues (id, slug, name, capacity, sort_order) values
  ('GATE-A', 'gate-a-main-campus-entrance', 'Gate A - Main Campus Entrance', 150, 1),
  ('GATE-B', 'gate-b-auditorium-stage', 'Gate B - Auditorium & Stage', 120, 2),
  ('GATE-C', 'gate-c-primary-section-gate', 'Gate C - Primary Section Gate', 100, 3),
  ('GATE-D', 'gate-d-sports-exhibition-hall', 'Gate D - Sports & Exhibition Hall', 100, 4)
on conflict (id) do nothing;

-- 3. AUTHORIZED USERS (Managed by Control Dashboard via registered email addresses)
-- Roles:
--   'control' -> Control Dashboard Admin (can toggle between Control & Regular Dashboard)
--   'regular' -> Tier 1: Regular Dashboard User (view-only + Staff Desk Manual Reg & Lookup + Logs)
--   'gate'    -> Tier 2: Gate Control Mobile Scanner User (scan QR codes + Logs)
create table if not exists public.authorized_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null default '',
  role text not null check (role in ('control', 'regular', 'gate')),
  active boolean not null default true,
  added_by text default 'system',
  created_at timestamptz not null default now()
);

-- Seed initial Control Admin (replace with your admin email before/after running)
insert into public.authorized_users (email, full_name, role, added_by)
values ('admin@sabis-events.edu', 'SABIS Control Admin', 'control', 'system')
on conflict (email) do nothing;

-- 4. REGISTRATIONS (Parent / Invitee submissions)
create table if not exists public.registrations (
  id text primary key,
  parent_number text not null default '',
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  school_type text not null default '',
  school_branch text not null default '',
  school_other text not null default '',
  category text not null default 'Regular Parent',
  assigned_gate text not null,
  party_size int not null default 1 check (party_size >= 1 and party_size <= 20),
  attendee_ages jsonb not null default '[]'::jsonb,
  other_attendees jsonb not null default '[]'::jsonb,
  notes text not null default '',
  delivery_mode text not null default 'on_screen',
  delivery_status text not null default 'displayed',
  registered_at timestamptz not null default now()
);

create index if not exists idx_registrations_gate on public.registrations(assigned_gate);
create index if not exists idx_registrations_parent_number on public.registrations(parent_number);

-- 5. ATTENDEE PASSES (1 individual QR pass per attendee -> count follows party_size)
create table if not exists public.attendee_passes (
  pass_code text primary key,
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

create index if not exists idx_attendee_passes_reg on public.attendee_passes(registration_id);
create index if not exists idx_attendee_passes_status on public.attendee_passes(status);

-- 6. SCAN LOGS (Visible to ALL authenticated users: VALID / INVALID / USED + timing logs)
create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
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

create index if not exists idx_scan_logs_time on public.scan_logs(scanned_at desc);
create index if not exists idx_scan_logs_status on public.scan_logs(status);

-- ============================================================================
-- HELPER FUNCTIONS FOR ROLE-BASED ACCESS CONTROL (RLS)
-- ============================================================================
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
as $$
  select role
  from public.authorized_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and active = true
  limit 1;
$$;

create or replace function public.is_control_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(public.current_user_role() = 'control', false);
$$;

create or replace function public.is_any_staff()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(public.current_user_role() in ('control', 'regular', 'gate'), false);
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
alter table public.event_settings enable row level security;
alter table public.venues enable row level security;
alter table public.authorized_users enable row level security;
alter table public.registrations enable row level security;
alter table public.attendee_passes enable row level security;
alter table public.scan_logs enable row level security;

-- event_settings: public read (invitation form needs toggles), ONLY control admin write
drop policy if exists "Public can read event settings" on public.event_settings;
create policy "Public can read event settings" on public.event_settings
  for select using (true);

drop policy if exists "Control admin can update event settings" on public.event_settings;
create policy "Control admin can update event settings" on public.event_settings
  for all using (public.is_control_admin()) with check (public.is_control_admin());

-- venues: public read (invitation form needs venue name/slug), ONLY control admin write
drop policy if exists "Public can read venues" on public.venues;
create policy "Public can read venues" on public.venues
  for select using (true);

drop policy if exists "Control admin can manage venues" on public.venues;
create policy "Control admin can manage venues" on public.venues
  for all using (public.is_control_admin()) with check (public.is_control_admin());

-- authorized_users: staff can read their own row; control admin manages all
drop policy if exists "Users can read own authorization" on public.authorized_users;
create policy "Users can read own authorization" on public.authorized_users
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_control_admin()
  );

drop policy if exists "Control admin manages authorized users" on public.authorized_users;
create policy "Control admin manages authorized users" on public.authorized_users
  for all using (public.is_control_admin()) with check (public.is_control_admin());

-- registrations: public can insert (invitation page), staff can read, regular+control can insert desk reg, control can update/delete
drop policy if exists "Public and staff can create registrations" on public.registrations;
create policy "Public and staff can create registrations" on public.registrations
  for insert with check (true);

drop policy if exists "Staff can read all registrations" on public.registrations;
create policy "Staff can read all registrations" on public.registrations
  for select using (public.is_any_staff());

drop policy if exists "Control admin can update or delete registrations" on public.registrations;
create policy "Control admin can update or delete registrations" on public.registrations
  for update using (public.is_control_admin());

drop policy if exists "Control admin can delete registrations" on public.registrations;
create policy "Control admin can delete registrations" on public.registrations
  for delete using (public.is_control_admin());

-- attendee_passes: public can insert (during registration), staff can read, gate+control can update (mark USED)
drop policy if exists "Public and staff can create passes" on public.attendee_passes;
create policy "Public and staff can create passes" on public.attendee_passes
  for insert with check (true);

drop policy if exists "Staff can read all passes" on public.attendee_passes;
create policy "Staff can read all passes" on public.attendee_passes
  for select using (public.is_any_staff());

drop policy if exists "Gate and control can update passes" on public.attendee_passes;
create policy "Gate and control can update passes" on public.attendee_passes
  for update using (public.current_user_role() in ('control', 'gate'));

drop policy if exists "Control admin can delete passes" on public.attendee_passes;
create policy "Control admin can delete passes" on public.attendee_passes
  for delete using (public.is_control_admin());

-- scan_logs: ALL authenticated users can read logs; gate+control can insert logs; control can delete
drop policy if exists "All authenticated staff can read scan logs" on public.scan_logs;
create policy "All authenticated staff can read scan logs" on public.scan_logs
  for select using (public.is_any_staff());

drop policy if exists "Gate and control can insert scan logs" on public.scan_logs;
create policy "Gate and control can insert scan logs" on public.scan_logs
  for insert with check (public.current_user_role() in ('control', 'gate'));

drop policy if exists "Control admin can delete scan logs" on public.scan_logs;
create policy "Control admin can delete scan logs" on public.scan_logs
  for delete using (public.is_control_admin());

-- ============================================================================
-- ENABLE REALTIME SUBSCRIPTIONS
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.event_settings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.venues;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.registrations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.attendee_passes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.scan_logs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.authorized_users;
exception when duplicate_object then null;
end $$;

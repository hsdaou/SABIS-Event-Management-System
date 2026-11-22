-- ============================================================================
-- SABIS® Event Management System — v2 Multi-Event & Contact Requirements Migration
-- Safe to run on an existing Supabase database (preserves existing data!)
-- ============================================================================

-- 1. Create events table
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

-- Seed default event from existing event_settings if present
insert into public.events (id, slug, name, qr_delivery_mode, contact_delivery_channel, strict_gate_mode, field_toggles)
select
  'evt-default',
  'sabis-parent-event',
  coalesce((select event_title from public.event_settings where id = 1), 'SABIS® Parent Event Registration & Gate Check-In'),
  coalesce((select qr_delivery_mode from public.event_settings where id = 1), 'on_screen'),
  coalesce((select contact_delivery_channel from public.event_settings where id = 1), 'both'),
  coalesce((select strict_gate_mode from public.event_settings where id = 1), false),
  coalesce((select field_toggles from public.event_settings where id = 1), '{
    "parentNumber": true,
    "fullName": true,
    "phone": true,
    "email": true,
    "numAttendees": true,
    "school": true,
    "attendeeAges": true,
    "otherAttendeeContacts": true
  }'::jsonb)
on conflict (id) do nothing;

-- 2. Add event_id to venues, registrations, attendee_passes, scan_logs
alter table public.venues add column if not exists event_id text not null default 'evt-default';
alter table public.registrations add column if not exists event_id text not null default 'evt-default';
alter table public.attendee_passes add column if not exists event_id text not null default 'evt-default';
alter table public.scan_logs add column if not exists event_id text not null default 'evt-default';

-- Allow same venue slug in different events (drop old single-column unique constraint if present)
alter table public.venues drop constraint if exists venues_slug_key;
create unique index if not exists idx_venues_event_slug on public.venues(event_id, slug);
create index if not exists idx_registrations_event on public.registrations(event_id);
create index if not exists idx_passes_event on public.attendee_passes(event_id);
create index if not exists idx_logs_event on public.scan_logs(event_id);

-- 3. RLS for events table
alter table public.events enable row level security;

drop policy if exists "Public can read events" on public.events;
create policy "Public can read events" on public.events
  for select using (true);

drop policy if exists "Control admin manages events" on public.events;
create policy "Control admin manages events" on public.events
  for all using (public.is_control_admin()) with check (public.is_control_admin());

-- 4. Enable Realtime on events table
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;

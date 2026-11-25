import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_AUTHORIZED_USERS,
  DEFAULT_EVENT_ID,
  DEFAULT_EVENTS,
  DEFAULT_FIELD_TOGGLES,
  DEFAULT_REGISTRATIONS,
  DEFAULT_REQUIRED_FIELDS,
  DEFAULT_SCAN_LOGS,
  DEFAULT_VENUES,
} from '../data/defaults';
import { buildPassQrPayload, generateQrDataUrl, playScannerTone, slugifyVenue } from '../lib/qr';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type {
  AttendeePass,
  AuthorizedUser,
  AuthSession,
  EventItem,
  EventSettings,
  FieldToggles,
  OtherAttendeeDetail,
  Registration,
  RequiredFields,
  ScanLog,
  ScanOutcome,
  UserRole,
  Venue,
} from '../types';

const LOCAL_STATE_KEY = 'sabis_ems_state_v3';
const LOCAL_SESSION_KEY = 'sabis_ems_session_v2';

export interface CreateRegistrationInput {
  eventId?: string;
  parentNumber: string;
  name: string;
  phone: string;
  email: string;
  schoolType: 'sabis_isc' | 'other' | '';
  schoolBranch: string;
  schoolOther: string;
  category: 'VIP' | 'Parent';
  assignedGate: string;
  partySize: number;
  attendeeAges: string[];
  otherAttendees: OtherAttendeeDetail[];
  notes?: string;
  fromInvitationPage?: boolean;
}

export interface ScanResult {
  status: ScanOutcome;
  scannedAt: string;
  headline: string;
  subtext: string;
  registration: Registration | null;
  pass: AttendeePass | null;
  activeGate: string;
  eventName?: string;
  firstUsedAt?: string | null;
}

function generateUniqueRegId(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const tsPart = Date.now().toString(36).slice(-4).toUpperCase();
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EVT-${year}-${tsPart}${randPart}`;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

interface EventContextValue {
  loading: boolean;
  isLiveSupabase: boolean;

  // Multi-event state
  allEvents: EventItem[];
  events: EventItem[]; // Scoped to session.allowedEventIds for School Dashboard & Gate Control users
  hasAssignedEvents: boolean;
  activeEventId: string;
  activeEvent: EventItem;
  setActiveEventId: (eventId: string) => void;
  getEventBySlugOrId: (slugOrId?: string | null) => EventItem;
  getVenuesForEvent: (eventId: string) => Venue[];
  createEvent: (name: string, eventDate?: string) => Promise<EventItem>;
  renameEvent: (eventId: string, name: string, eventDate?: string) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;

  // Scoped active-event views
  settings: EventSettings;
  venues: Venue[];
  registrations: Registration[];
  scanLogs: ScanLog[];

  // Global auth & users
  authorizedUsers: AuthorizedUser[];
  session: AuthSession | null;
  audioMuted: boolean;
  toast: ToastMessage | null;
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
  toggleAudioMute: () => void;

  // Auth
  loginWithEmail: (
    email: string,
    password?: string
  ) => Promise<{ ok: boolean; error?: string; role?: UserRole }>;
  sendMagicLink: (email: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;

  // Control Admin settings & venues (for active event)
  updateSettings: (patch: Partial<EventSettings>) => Promise<void>;
  updateFieldToggle: (key: keyof FieldToggles, value: boolean) => Promise<void>;
  updateRequiredField: (key: keyof RequiredFields, value: boolean) => Promise<void>;
  saveVenues: (nextVenues: Venue[]) => Promise<void>;

  // Control Admin user management (with event-specific authorization)
  addAuthorizedUser: (
    email: string,
    fullName: string,
    role: UserRole,
    allowedEventIds?: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  updateAuthorizedUser: (
    id: string,
    patch: Partial<Pick<AuthorizedUser, 'role' | 'active' | 'fullName' | 'allowedEventIds'>>
  ) => Promise<void>;
  removeAuthorizedUser: (id: string) => Promise<void>;

  // Registrations & passes (with duplicate detection + editing)
  findExistingRegistration: (
    eventId: string,
    lookup: { parentNumber?: string; email?: string; phone?: string }
  ) => Promise<Registration | null>;
  createRegistration: (
    input: CreateRegistrationInput
  ) => Promise<{
    registration?: Registration;
    duplicate?: Registration;
    dispatchMessage?: string;
  }>;
  updateExistingRegistration: (
    registrationId: string,
    input: CreateRegistrationInput
  ) => Promise<{ ok: boolean; registration?: Registration; dispatchMessage?: string; error?: string }>;
  importCsvRegistrations: (
    venueName: string,
    tier: 'VIP' | 'Parent',
    rows: Array<{
      parentNumber: string;
      name: string;
      phone: string;
      email?: string;
      partySize: number;
      schoolBranch?: string;
    }>
  ) => Promise<number>;
  deleteRegistration: (regId: string) => Promise<void>;
  resendQrPasses: (registration: Registration) => Promise<{ ok: boolean; message: string }>;

  // Gate Scanner & Logs
  scanQrCode: (rawInput: string, activeGate: string) => Promise<ScanResult>;
  clearScanLogs: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  refreshData: () => Promise<void>;
}

interface LocalStoredState {
  events: EventItem[];
  activeEventId: string;
  venues: Venue[];
  authorizedUsers: AuthorizedUser[];
  registrations: Registration[];
  scanLogs: ScanLog[];
  nextCounter: number;
  audioMuted: boolean;
}

const EventContext = createContext<EventContextValue | null>(null);

function normalizeEvent(ev: Partial<EventItem>): EventItem {
  return {
    id: ev.id || DEFAULT_EVENT_ID,
    slug: ev.slug || slugifyVenue(ev.name || 'sabis-event'),
    name: ev.name || 'SABIS® Event',
    eventDate: ev.eventDate || '',
    qrDeliveryMode: ev.qrDeliveryMode === 'contact_info' ? 'contact_info' : 'on_screen',
    contactDeliveryChannel: ev.contactDeliveryChannel || 'both',
    strictGateMode: Boolean(ev.strictGateMode),
    fieldToggles: { ...DEFAULT_FIELD_TOGGLES, ...(ev.fieldToggles || {}) },
    requiredFields: { ...DEFAULT_REQUIRED_FIELDS, ...(ev.requiredFields || {}) },
    createdAt: ev.createdAt || new Date().toISOString(),
  };
}

function loadLocalState(): LocalStoredState {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStoredState>;
      const events =
        Array.isArray(parsed.events) && parsed.events.length > 0
          ? parsed.events.map(normalizeEvent)
          : DEFAULT_EVENTS;
      const activeEventId =
        parsed.activeEventId && events.some((e) => e.id === parsed.activeEventId)
          ? parsed.activeEventId
          : events[0].id;
      return {
        events,
        activeEventId,
        venues:
          Array.isArray(parsed.venues) && parsed.venues.length > 0
            ? parsed.venues.map((v) => ({ ...v, eventId: v.eventId || DEFAULT_EVENT_ID }))
            : DEFAULT_VENUES,
        authorizedUsers:
          Array.isArray(parsed.authorizedUsers) && parsed.authorizedUsers.length > 0
            ? parsed.authorizedUsers.map((u) => ({
                ...u,
                allowedEventIds: Array.isArray(u.allowedEventIds)
                  ? u.allowedEventIds
                  : u.role === 'control'
                  ? []
                  : events.map((e) => e.id),
              }))
            : DEFAULT_AUTHORIZED_USERS,
      registrations: Array.isArray(parsed.registrations)
          ? parsed.registrations.map((r) => ({
              ...r,
              category: r.category === 'VIP' ? 'VIP' : 'Parent',
              eventId: r.eventId || DEFAULT_EVENT_ID,
              passes: (r.passes || []).map((p) => ({
                ...p,
                eventId: p.eventId || r.eventId || DEFAULT_EVENT_ID,
              })),
            }))
          : DEFAULT_REGISTRATIONS,
        scanLogs: Array.isArray(parsed.scanLogs)
          ? parsed.scanLogs.map((l) => ({ ...l, eventId: l.eventId || DEFAULT_EVENT_ID }))
          : DEFAULT_SCAN_LOGS,
        nextCounter: typeof parsed.nextCounter === 'number' ? parsed.nextCounter : 1007,
        audioMuted: Boolean(parsed.audioMuted),
      };
    }
  } catch {
    // ignore
  }
  return {
    events: DEFAULT_EVENTS,
    activeEventId: DEFAULT_EVENT_ID,
    venues: DEFAULT_VENUES,
    authorizedUsers: DEFAULT_AUTHORIZED_USERS,
    registrations: DEFAULT_REGISTRATIONS,
    scanLogs: DEFAULT_SCAN_LOGS,
    nextCounter: 1007,
    audioMuted: false,
  };
}

function saveLocalState(state: LocalStoredState) {
  try {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadLocalSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      if (parsed.email && parsed.role) {
        return {
          email: parsed.email,
          fullName: parsed.fullName || parsed.email,
          role: parsed.role,
          allowedEventIds: Array.isArray(parsed.allowedEventIds) ? parsed.allowedEventIds : [],
          isSupabaseAuth: Boolean(parsed.isSupabaseAuth),
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizePhoneDigits(phone?: string): string {
  return String(phone || '').replace(/\D/g, '');
}

function phonesMatch(a?: string, b?: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (da.length < 6 || db.length < 6) return false;
  if (da === db) return true;
  // Match local vs international format (e.g. 050 123 4567 and +971 50 123 4567 -> last 9 digits 501234567)
  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) return true;
  return false;
}

function hydrateRegistrationFromRpc(
  regRow: Record<string, unknown>,
  passRows: Array<Record<string, unknown>>
): Registration {
  const regIdStr = String(regRow.id);
  const eventIdStr = String(regRow.event_id || DEFAULT_EVENT_ID);
  const passes: AttendeePass[] = (passRows || []).map((p) => ({
    passCode: String(p.pass_code),
    eventId: String(p.event_id || eventIdStr),
    registrationId: String(p.registration_id || regIdStr),
    passIndex: Number(p.pass_index) || 1,
    totalPasses: Number(p.total_passes) || 1,
    attendeeLabel: String(p.attendee_label || ''),
    attendeeAge: String(p.attendee_age || ''),
    attendeeContact: String(p.attendee_contact || ''),
    status: p.status === 'USED' ? 'USED' : 'PENDING',
    usedAt: p.used_at ? String(p.used_at) : null,
    usedGate: p.used_gate ? String(p.used_gate) : null,
    scannedBy: p.scanned_by ? String(p.scanned_by) : null,
  }));

  return {
    id: regIdStr,
    eventId: eventIdStr,
    parentNumber: String(regRow.parent_number || ''),
    name: String(regRow.name || ''),
    phone: String(regRow.phone || ''),
    email: String(regRow.email || ''),
    schoolType: (regRow.school_type || '') as Registration['schoolType'],
    schoolBranch: String(regRow.school_branch || ''),
    schoolOther: String(regRow.school_other || ''),
    category: regRow.category === 'VIP' ? 'VIP' : 'Parent',
    assignedGate: String(regRow.assigned_gate || ''),
    partySize: Number(regRow.party_size) || 1,
    attendeeAges: Array.isArray(regRow.attendee_ages) ? (regRow.attendee_ages as string[]) : [],
    otherAttendees: Array.isArray(regRow.other_attendees)
      ? (regRow.other_attendees as OtherAttendeeDetail[])
      : [],
    notes: String(regRow.notes || ''),
    deliveryMode: regRow.delivery_mode === 'contact_info' ? 'contact_info' : 'on_screen',
    deliveryStatus: (regRow.delivery_status || 'displayed') as Registration['deliveryStatus'],
    registeredAt: String(regRow.registered_at || new Date().toISOString()),
    passes,
  };
}

export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocal = useMemo(() => loadLocalState(), []);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [events, setEvents] = useState<EventItem[]>(initialLocal.events);
  const [activeEventId, setActiveEventIdState] = useState<string>(initialLocal.activeEventId);
  const [allVenues, setAllVenues] = useState<Venue[]>(initialLocal.venues);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>(initialLocal.authorizedUsers);
  const [allRegistrations, setAllRegistrations] = useState<Registration[]>(initialLocal.registrations);
  const [allScanLogs, setAllScanLogs] = useState<ScanLog[]>(initialLocal.scanLogs);
  const [nextCounter, setNextCounter] = useState<number>(initialLocal.nextCounter);
  const [audioMuted, setAudioMuted] = useState<boolean>(initialLocal.audioMuted);
  const [session, setSession] = useState<AuthSession | null>(() =>
    isSupabaseConfigured ? null : loadLocalSession()
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = Date.now();
    setToast({ id, text, tone });
    window.setTimeout(() => {
      setToast((curr) => (curr && curr.id === id ? null : curr));
    }, 3600);
  }, []);

  // Scoped events: Control Admins & unauthenticated public invitation pages see all events;
  // School Dashboard ('regular') & Gate Control ('gate') ONLY see their specifically assigned events!
  const visibleEvents = useMemo<EventItem[]>(() => {
    if (!session || session.role === 'control') return events;
    const allowedSet = new Set(session.allowedEventIds || []);
    return events.filter((e) => allowedSet.has(e.id));
  }, [events, session]);

  const hasAssignedEvents = useMemo<boolean>(() => {
    if (!session || session.role === 'control') return true;
    return visibleEvents.length > 0;
  }, [session, visibleEvents.length]);

  const activeEvent = useMemo<EventItem>(() => {
    const pool = !session || session.role === 'control' ? events : visibleEvents;
    return pool.find((e) => e.id === activeEventId) || pool[0] || events[0] || DEFAULT_EVENTS[0];
  }, [activeEventId, events, session, visibleEvents]);

  // Keep activeEventId synced within visibleEvents when switching roles or updating permissions
  useEffect(() => {
    if (session && session.role !== 'control' && visibleEvents.length > 0) {
      if (!visibleEvents.some((e) => e.id === activeEventId)) {
        setActiveEventIdState(visibleEvents[0].id);
      }
    }
  }, [activeEventId, session, visibleEvents]);

  const setActiveEventId = useCallback(
    (id: string) => {
      const pool = !session || session.role === 'control' ? events : visibleEvents;
      if (pool.some((e) => e.id === id)) {
        setActiveEventIdState(id);
      }
    },
    [events, session, visibleEvents]
  );

  const getEventBySlugOrId = useCallback(
    (slugOrId?: string | null): EventItem => {
      if (slugOrId) {
        const lower = slugOrId.trim().toLowerCase();
        const found = events.find(
          (e) => e.slug.toLowerCase() === lower || e.id.toLowerCase() === lower
        );
        if (found) return found;
      }
      return activeEvent;
    },
    [activeEvent, events]
  );

  const getVenuesForEvent = useCallback(
    (eventId: string): Venue[] => {
      const scoped = allVenues.filter((v) => v.eventId === eventId);
      return scoped.length > 0 ? scoped : allVenues;
    },
    [allVenues]
  );

  const settings = useMemo<EventSettings>(
    () => ({
      eventTitle: activeEvent.name,
      qrDeliveryMode: activeEvent.qrDeliveryMode,
      contactDeliveryChannel: activeEvent.contactDeliveryChannel,
      strictGateMode: activeEvent.strictGateMode,
      fieldToggles: activeEvent.fieldToggles,
      requiredFields: activeEvent.requiredFields,
    }),
    [activeEvent]
  );

  const venues = useMemo(
    () => allVenues.filter((v) => v.eventId === activeEvent.id),
    [activeEvent.id, allVenues]
  );

  const registrations = useMemo(
    () => allRegistrations.filter((r) => r.eventId === activeEvent.id),
    [activeEvent.id, allRegistrations]
  );

  const scanLogs = useMemo(
    () => allScanLogs.filter((l) => l.eventId === activeEvent.id),
    [activeEvent.id, allScanLogs]
  );

  // Persist local state when running without Supabase
  useEffect(() => {
    if (!isSupabaseConfigured) {
      saveLocalState({
        events,
        activeEventId: activeEvent.id,
        venues: allVenues,
        authorizedUsers,
        registrations: allRegistrations,
        scanLogs: allScanLogs,
        nextCounter,
        audioMuted,
      });
    }
  }, [
    activeEvent.id,
    allRegistrations,
    allScanLogs,
    allVenues,
    audioMuted,
    authorizedUsers,
    events,
    nextCounter,
  ]);

  // Cross-tab sync in local preview mode
  useEffect(() => {
    if (isSupabaseConfigured) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STATE_KEY) {
        const fresh = loadLocalState();
        setEvents(fresh.events);
        setActiveEventIdState(fresh.activeEventId);
        setAllVenues(fresh.venues);
        setAuthorizedUsers(fresh.authorizedUsers);
        setAllRegistrations(fresh.registrations);
        setAllScanLogs(fresh.scanLogs);
        setNextCounter(fresh.nextCounter);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const fetchSupabaseData = useCallback(async () => {
    if (!supabase) return;
    try {
      const [eventsRes, legacySettingsRes, venuesRes, usersRes, regsRes, passesRes, logsRes] =
        await Promise.all([
          supabase.from('events').select('*').order('created_at', { ascending: true }),
          supabase.from('event_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('venues').select('*').order('sort_order', { ascending: true }),
          supabase.from('authorized_users').select('*').order('created_at', { ascending: true }),
          supabase.from('registrations').select('*').order('registered_at', { ascending: false }),
          supabase.from('attendee_passes').select('*').order('pass_index', { ascending: true }),
          supabase.from('scan_logs').select('*').order('scanned_at', { ascending: false }).limit(500),
        ]);

      if (!eventsRes.error && eventsRes.data && eventsRes.data.length > 0) {
        const mappedEvents = eventsRes.data.map((ev) =>
          normalizeEvent({
            id: ev.id,
            slug: ev.slug,
            name: ev.name,
            eventDate: ev.event_date || '',
            qrDeliveryMode: ev.qr_delivery_mode,
            contactDeliveryChannel: ev.contact_delivery_channel,
            strictGateMode: ev.strict_gate_mode,
            fieldToggles: ev.field_toggles,
            requiredFields: ev.required_fields,
            createdAt: ev.created_at,
          })
        );
        setEvents(mappedEvents);
        setActiveEventIdState((prev) =>
          mappedEvents.some((e) => e.id === prev) ? prev : mappedEvents[0].id
        );
      } else if (!legacySettingsRes.error && legacySettingsRes.data) {
        const d = legacySettingsRes.data;
        const fallbackEv = normalizeEvent({
          id: DEFAULT_EVENT_ID,
          slug: 'sabis-parent-event',
          name: d.event_title || DEFAULT_EVENTS[0].name,
          qrDeliveryMode: d.qr_delivery_mode,
          contactDeliveryChannel: d.contact_delivery_channel,
          strictGateMode: d.strict_gate_mode,
          fieldToggles: d.field_toggles,
          requiredFields: d.required_fields,
        });
        setEvents([fallbackEv]);
        setActiveEventIdState(DEFAULT_EVENT_ID);
      }

      if (!venuesRes.error && venuesRes.data && venuesRes.data.length > 0) {
        setAllVenues(
          venuesRes.data.map((v) => ({
            id: v.id,
            eventId: v.event_id || DEFAULT_EVENT_ID,
            slug: v.slug,
            name: v.name,
            capacity: v.capacity,
            sortOrder: v.sort_order,
          }))
        );
      }

      if (!usersRes.error && usersRes.data) {
        setAuthorizedUsers(
          usersRes.data.map((u) => ({
            id: u.id,
            email: u.email,
            fullName: u.full_name || '',
            role: u.role as UserRole,
            active: Boolean(u.active),
            allowedEventIds: Array.isArray(u.allowed_event_ids)
              ? (u.allowed_event_ids as string[])
              : [],
            addedBy: u.added_by || '',
            createdAt: u.created_at,
          }))
        );
      }

      if (!regsRes.error && regsRes.data) {
        const passesByReg = new Map<string, AttendeePass[]>();
        (passesRes.data || []).forEach((p) => {
          const mapped: AttendeePass = {
            passCode: p.pass_code,
            eventId: p.event_id || DEFAULT_EVENT_ID,
            registrationId: p.registration_id,
            passIndex: p.pass_index,
            totalPasses: p.total_passes,
            attendeeLabel: p.attendee_label || '',
            attendeeAge: p.attendee_age || '',
            attendeeContact: p.attendee_contact || '',
            status: p.status === 'USED' ? 'USED' : 'PENDING',
            usedAt: p.used_at,
            usedGate: p.used_gate,
            scannedBy: p.scanned_by,
          };
          const arr = passesByReg.get(p.registration_id) || [];
          arr.push(mapped);
          passesByReg.set(p.registration_id, arr);
        });

        setAllRegistrations(
          regsRes.data.map((r) => ({
            id: r.id,
            eventId: r.event_id || DEFAULT_EVENT_ID,
            parentNumber: r.parent_number || '',
            name: r.name || '',
            phone: r.phone || '',
            email: r.email || '',
            schoolType: (r.school_type || '') as Registration['schoolType'],
            schoolBranch: r.school_branch || '',
            schoolOther: r.school_other || '',
            category: r.category === 'VIP' ? 'VIP' : 'Parent',
            assignedGate: r.assigned_gate,
            partySize: r.party_size || 1,
            attendeeAges: Array.isArray(r.attendee_ages) ? r.attendee_ages : [],
            otherAttendees: Array.isArray(r.other_attendees) ? r.other_attendees : [],
            notes: r.notes || '',
            deliveryMode: r.delivery_mode === 'contact_info' ? 'contact_info' : 'on_screen',
            deliveryStatus: (r.delivery_status || 'displayed') as Registration['deliveryStatus'],
            registeredAt: r.registered_at,
            passes: passesByReg.get(r.id) || [],
          }))
        );
      }

      if (!logsRes.error && logsRes.data) {
        setAllScanLogs(
          logsRes.data.map((l) => ({
            id: l.id,
            eventId: l.event_id || DEFAULT_EVENT_ID,
            scannedAt: l.scanned_at,
            passCode: l.pass_code || '',
            registrationId: l.registration_id || '',
            parentNumber: l.parent_number || '',
            attendeeName: l.attendee_name || '',
            tier: l.tier === 'Regular Parent' ? 'Parent' : l.tier || '',
            gate: l.gate || '',
            status: (l.status || 'INVALID') as ScanOutcome,
            message: l.message || '',
            firstUsedAt: l.first_used_at,
            scannedBy: l.scanned_by || '',
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const syncSupabaseSession = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const userEmail = data.session?.user?.email?.toLowerCase();
    if (!userEmail) {
      setSession(null);
      return;
    }

    const { data: authRow } = await supabase
      .from('authorized_users')
      .select('*')
      .ilike('email', userEmail)
      .eq('active', true)
      .maybeSingle();

    const defaultControlEmail = (import.meta.env.VITE_DEFAULT_CONTROL_EMAIL || '').trim().toLowerCase();
    if (authRow) {
      setSession({
        email: authRow.email,
        fullName: authRow.full_name || authRow.email,
        role: authRow.role as UserRole,
        allowedEventIds: Array.isArray(authRow.allowed_event_ids)
          ? (authRow.allowed_event_ids as string[])
          : [],
        isSupabaseAuth: true,
      });
    } else if (defaultControlEmail && userEmail === defaultControlEmail) {
      setSession({
        email: userEmail,
        fullName: 'SABIS Control Admin',
        role: 'control',
        allowedEventIds: [],
        isSupabaseAuth: true,
      });
    } else {
      await supabase.auth.signOut();
      setSession(null);
      showToast('This email is not authorized by the Control Dashboard.', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    syncSupabaseSession().then(() => fetchSupabaseData());

    const { data: authSub } = client.auth.onAuthStateChange(() => {
      syncSupabaseSession().then(() => fetchSupabaseData());
    });

    const channel = client
      .channel('sabis-ems-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchSupabaseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, () => fetchSupabaseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => fetchSupabaseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendee_passes' }, () => fetchSupabaseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_logs' }, () => fetchSupabaseData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'authorized_users' }, () => fetchSupabaseData())
      .subscribe();

    return () => {
      authSub.subscription.unsubscribe();
      client.removeChannel(channel);
    };
  }, [fetchSupabaseData, syncSupabaseSession]);

  const toggleAudioMute = useCallback(() => {
    setAudioMuted((prev) => {
      const next = !prev;
      showToast(next ? 'Scanner sound muted' : 'Scanner sound enabled', 'info');
      return next;
    });
  }, [showToast]);

  // ==================== AUTH ====================
  const loginWithEmail = useCallback(
    async (emailRaw: string, password?: string) => {
      const email = emailRaw.trim().toLowerCase();
      if (!email) return { ok: false, error: 'Please enter a registered email address.' };

      if (supabase) {
        if (!password) {
          return { ok: false, error: 'Enter your password or use Magic Link sign-in.' };
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: error.message };

        const { data: authRow } = await supabase
          .from('authorized_users')
          .select('*')
          .ilike('email', email)
          .eq('active', true)
          .maybeSingle();

        const defaultControlEmail = (import.meta.env.VITE_DEFAULT_CONTROL_EMAIL || '').trim().toLowerCase();
        const resolvedRole: UserRole | null = authRow
          ? (authRow.role as UserRole)
          : defaultControlEmail && email === defaultControlEmail
          ? 'control'
          : null;

        if (!resolvedRole) {
          await supabase.auth.signOut();
          return {
            ok: false,
            error: 'Your email is not registered in the Control Dashboard access list.',
          };
        }

        const nextSession: AuthSession = {
          email,
          fullName: authRow?.full_name || email,
          role: resolvedRole,
          allowedEventIds: Array.isArray(authRow?.allowed_event_ids)
            ? (authRow.allowed_event_ids as string[])
            : [],
          isSupabaseAuth: true,
        };
        setSession(nextSession);
        await fetchSupabaseData();
        return { ok: true, role: resolvedRole };
      }

      const matched = authorizedUsers.find(
        (u) => u.email.toLowerCase() === email && u.active
      );
      if (!matched) {
        return {
          ok: false,
          error:
            'Email not found in the authorized access list. Ask a Control Dashboard Admin to add this email.',
        };
      }
      const nextSession: AuthSession = {
        email: matched.email,
        fullName: matched.fullName || matched.email,
        role: matched.role,
        allowedEventIds: matched.allowedEventIds || [],
        isSupabaseAuth: false,
      };
      setSession(nextSession);
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(nextSession));
      return { ok: true, role: matched.role };
    },
    [authorizedUsers, fetchSupabaseData]
  );

  const sendMagicLink = useCallback(async (emailRaw: string) => {
    const email = emailRaw.trim().toLowerCase();
    if (!email) return { ok: false, error: 'Enter a valid email address.' };
    if (!supabase) {
      return {
        ok: false,
        error: 'Magic Link requires live Supabase configuration.',
      };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem(LOCAL_SESSION_KEY);
    setSession(null);
  }, []);

  // ==================== MULTI-EVENT MANAGEMENT (CONTROL ADMIN ONLY) ====================
  const persistEventToSupabase = useCallback(async (ev: EventItem) => {
    if (!supabase) return;
    await supabase.from('events').upsert({
      id: ev.id,
      slug: ev.slug,
      name: ev.name,
      event_date: ev.eventDate,
      qr_delivery_mode: ev.qrDeliveryMode,
      contact_delivery_channel: ev.contactDeliveryChannel,
      strict_gate_mode: ev.strictGateMode,
      field_toggles: ev.fieldToggles,
      required_fields: ev.requiredFields,
    });
  }, []);

  const createEvent = useCallback(
    async (nameRaw: string, eventDateRaw = ''): Promise<EventItem> => {
      const name = nameRaw.trim() || 'New SABIS® Event';
      const id = `evt-${Date.now()}`;
      const baseSlug = slugifyVenue(name);
      const slug = events.some((e) => e.slug === baseSlug)
        ? `${baseSlug}-${Date.now().toString().slice(-4)}`
        : baseSlug;

      const newEvent: EventItem = {
        id,
        slug,
        name,
        eventDate: eventDateRaw.trim(),
        qrDeliveryMode: 'on_screen',
        contactDeliveryChannel: 'both',
        strictGateMode: false,
        fieldToggles: { ...DEFAULT_FIELD_TOGGLES },
        requiredFields: { ...DEFAULT_REQUIRED_FIELDS },
        createdAt: new Date().toISOString(),
      };

      const starterVenues: Venue[] = [
        {
          id: `GATE-${id}-1`,
          eventId: id,
          slug: 'gate-a-main-entrance',
          name: 'Gate A - Main Campus Entrance',
          capacity: 150,
          sortOrder: 1,
        },
        {
          id: `GATE-${id}-2`,
          eventId: id,
          slug: 'gate-b-auditorium',
          name: 'Gate B - Auditorium & Stage',
          capacity: 120,
          sortOrder: 2,
        },
      ];

      setEvents((prev) => [...prev, newEvent]);
      setAllVenues((prev) => [...prev, ...starterVenues]);
      setActiveEventIdState(newEvent.id);

      if (supabase) {
        await persistEventToSupabase(newEvent);
        await supabase.from('venues').insert(
          starterVenues.map((v) => ({
            id: v.id,
            event_id: v.eventId,
            slug: v.slug,
            name: v.name,
            capacity: v.capacity,
            sort_order: v.sortOrder,
          }))
        );
      }

      return newEvent;
    },
    [events, persistEventToSupabase]
  );

  const renameEvent = useCallback(
    async (eventId: string, nameRaw: string, eventDateRaw?: string) => {
      const name = nameRaw.trim();
      if (!name) return;
      let updated: EventItem | null = null;
      setEvents((prev) =>
        prev.map((ev) => {
          if (ev.id !== eventId) return ev;
          updated = {
            ...ev,
            name,
            eventDate: eventDateRaw !== undefined ? eventDateRaw.trim() : ev.eventDate,
          };
          return updated;
        })
      );
      if (updated) {
        await persistEventToSupabase(updated);
      }
    },
    [persistEventToSupabase]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      if (events.length <= 1) return;
      const remaining = events.filter((e) => e.id !== eventId);
      setEvents(remaining);
      setAllVenues((prev) => prev.filter((v) => v.eventId !== eventId));
      setAllRegistrations((prev) => prev.filter((r) => r.eventId !== eventId));
      setAllScanLogs((prev) => prev.filter((l) => l.eventId !== eventId));
      if (activeEventId === eventId) {
        setActiveEventIdState(remaining[0].id);
      }
      if (supabase) {
        await supabase.from('scan_logs').delete().eq('event_id', eventId);
        await supabase.from('attendee_passes').delete().eq('event_id', eventId);
        await supabase.from('registrations').delete().eq('event_id', eventId);
        await supabase.from('venues').delete().eq('event_id', eventId);
        await supabase.from('events').delete().eq('id', eventId);
      }
    },
    [activeEventId, events]
  );

  // ==================== CONTROL SETTINGS & VENUES (ACTIVE EVENT) ====================
  const updateSettings = useCallback(
    async (patch: Partial<EventSettings>) => {
      const mergedEvent: EventItem = {
        ...activeEvent,
        name: patch.eventTitle !== undefined ? patch.eventTitle : activeEvent.name,
        qrDeliveryMode: patch.qrDeliveryMode ?? activeEvent.qrDeliveryMode,
        contactDeliveryChannel: patch.contactDeliveryChannel ?? activeEvent.contactDeliveryChannel,
        strictGateMode: patch.strictGateMode ?? activeEvent.strictGateMode,
        fieldToggles: {
          ...activeEvent.fieldToggles,
          ...(patch.fieldToggles || {}),
        },
        requiredFields: {
          ...activeEvent.requiredFields,
          ...(patch.requiredFields || {}),
        },
      };

      setEvents((prev) => prev.map((ev) => (ev.id === mergedEvent.id ? mergedEvent : ev)));
      await persistEventToSupabase(mergedEvent);
    },
    [activeEvent, persistEventToSupabase]
  );

  const updateFieldToggle = useCallback(
    async (key: keyof FieldToggles, value: boolean) => {
      await updateSettings({
        fieldToggles: {
          ...activeEvent.fieldToggles,
          [key]: value,
        },
      });
    },
    [activeEvent.fieldToggles, updateSettings]
  );

  const updateRequiredField = useCallback(
    async (key: keyof RequiredFields, value: boolean) => {
      await updateSettings({
        requiredFields: {
          ...activeEvent.requiredFields,
          [key]: value,
        },
      });
    },
    [activeEvent.requiredFields, updateSettings]
  );

  const saveVenues = useCallback(
    async (nextVenues: Venue[]) => {
      const eventId = activeEvent.id;
      const usedSlugs = new Set<string>();
      const cleaned: Venue[] = nextVenues.map((v, idx) => {
        let slug = slugifyVenue(v.name);
        if (usedSlugs.has(slug)) slug = `${slug}-${idx + 1}`;
        usedSlugs.add(slug);
        return {
          id: v.id || `GATE-${eventId}-${idx + 1}`,
          eventId,
          slug,
          name: v.name.trim() || `Venue ${idx + 1}`,
          capacity: Math.max(10, Number(v.capacity) || 100),
          sortOrder: idx + 1,
        };
      });

      setAllVenues((prev) => [...prev.filter((v) => v.eventId !== eventId), ...cleaned]);

      if (supabase) {
        await supabase.from('venues').delete().eq('event_id', eventId);
        await supabase.from('venues').insert(
          cleaned.map((v) => ({
            id: v.id,
            event_id: v.eventId,
            slug: v.slug,
            name: v.name,
            capacity: v.capacity,
            sort_order: v.sortOrder,
          }))
        );
      }
    },
    [activeEvent.id]
  );

  // ==================== AUTHORIZED USERS ====================
  const addAuthorizedUser = useCallback(
    async (emailRaw: string, fullNameRaw: string, role: UserRole, allowedEventIdsInput?: string[]) => {
      const email = emailRaw.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return { ok: false, error: 'Enter a valid email address.' };
      }
      if (authorizedUsers.some((u) => u.email.toLowerCase() === email)) {
        return { ok: false, error: 'This email address is already registered.' };
      }
      const allowedEventIds =
        role === 'control'
          ? []
          : allowedEventIdsInput && allowedEventIdsInput.length > 0
          ? allowedEventIdsInput
          : [activeEvent.id];

      const newUser: AuthorizedUser = {
        id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        email,
        fullName: fullNameRaw.trim() || email.split('@')[0],
        role,
        active: true,
        allowedEventIds,
        addedBy: session?.email || 'control',
        createdAt: new Date().toISOString(),
      };
      if (supabase) {
        let { data, error } = await supabase
          .from('authorized_users')
          .insert({
            email: newUser.email,
            full_name: newUser.fullName,
            role: newUser.role,
            active: true,
            allowed_event_ids: newUser.allowedEventIds,
            added_by: newUser.addedBy,
          })
          .select()
          .single();
        if (error && error.message.toLowerCase().includes('allowed_event_ids')) {
          const retry = await supabase
            .from('authorized_users')
            .insert({
              email: newUser.email,
              full_name: newUser.fullName,
              role: newUser.role,
              active: true,
              added_by: newUser.addedBy,
            })
            .select()
            .single();
          data = retry.data;
          error = retry.error;
        }
        if (error) return { ok: false, error: error.message };
        if (data) newUser.id = data.id;
      }
      setAuthorizedUsers((prev) => [...prev, newUser]);
      return { ok: true };
    },
    [activeEvent.id, authorizedUsers, session?.email]
  );

  const updateAuthorizedUser = useCallback(
    async (
      id: string,
      patch: Partial<Pick<AuthorizedUser, 'role' | 'active' | 'fullName' | 'allowedEventIds'>>
    ) => {
      setAuthorizedUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
      if (supabase) {
        const payload: Record<string, unknown> = {};
        if (patch.role !== undefined) payload.role = patch.role;
        if (patch.active !== undefined) payload.active = patch.active;
        if (patch.fullName !== undefined) payload.full_name = patch.fullName;
        if (patch.allowedEventIds !== undefined) payload.allowed_event_ids = patch.allowedEventIds;
        const { error } = await supabase.from('authorized_users').update(payload).eq('id', id);
        if (error && error.message.toLowerCase().includes('allowed_event_ids')) {
          delete payload.allowed_event_ids;
          if (Object.keys(payload).length > 0) {
            await supabase.from('authorized_users').update(payload).eq('id', id);
          }
        }
      }
    },
    []
  );

  const removeAuthorizedUser = useCallback(async (id: string) => {
    setAuthorizedUsers((prev) => prev.filter((u) => u.id !== id));
    if (supabase) {
      await supabase.from('authorized_users').delete().eq('id', id);
    }
  }, []);

  // ==================== DISPATCH QR PASSES ====================
  const dispatchQrPasses = useCallback(
    async (registration: Registration): Promise<{ ok: boolean; message: string }> => {
      const targetEvent = events.find((e) => e.id === registration.eventId) || activeEvent;
      try {
        const passesWithQr = await Promise.all(
          registration.passes.map(async (p) => ({
            passCode: p.passCode,
            passIndex: p.passIndex,
            totalPasses: p.totalPasses,
            attendeeLabel: p.attendeeLabel || registration.name,
            qrDataUrl: await generateQrDataUrl(buildPassQrPayload(registration, p), 220),
          }))
        );

        const res = await fetch('/api/send-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventTitle: targetEvent.name,
            recipientEmail: registration.email,
            recipientPhone: registration.phone,
            parentName: registration.name,
            parentNumber: registration.parentNumber,
            venueName: registration.assignedGate,
            tier: registration.category,
            channel: targetEvent.contactDeliveryChannel,
            passes: passesWithQr,
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          emailSent?: boolean;
          message?: string;
          error?: string;
        };

        if (res.ok && data.emailSent) {
          return {
            ok: true,
            message:
              data.message ||
              `Delivered ${registration.passes.length} SABIS® QR pass(es) to ${registration.email}.`,
          };
        }

        return {
          ok: false,
          message:
            data.error ||
            data.message ||
            'Could not send email. Verify GMAIL_USER and GMAIL_APP_PASSWORD in Vercel Environment Variables.',
        };
      } catch {
        return {
          ok: false,
          message:
            'Email API unavailable in local preview mode. Deploy on Vercel with GMAIL_USER and GMAIL_APP_PASSWORD configured.',
        };
      }
    },
    [activeEvent, events]
  );

  // ==================== REGISTRATIONS & MULTI-QR PASSES (DEDUP + EDIT) ====================
  const findExistingRegistration = useCallback(
    async (
      eventId: string,
      lookup: { parentNumber?: string; email?: string; phone?: string }
    ): Promise<Registration | null> => {
      const pNum = (lookup.parentNumber || '').trim().toUpperCase();
      const email = (lookup.email || '').trim().toLowerCase();
      const phoneDigits = normalizePhoneDigits(lookup.phone);

      if (!pNum && !email && phoneDigits.length < 6) {
        return null;
      }

      // 1. Live Supabase lookup via SECURITY DEFINER RPC (works even for unauthenticated public invitees!)
      if (supabase) {
        try {
          const { data, error } = await supabase.rpc('lookup_existing_registration', {
            p_event_id: eventId,
            p_parent_number: pNum,
            p_email: email,
            p_phone: lookup.phone || '',
          });
          if (!error && data && data.registration) {
            const hydrated = hydrateRegistrationFromRpc(
              data.registration as Record<string, unknown>,
              Array.isArray(data.passes) ? (data.passes as Array<Record<string, unknown>>) : []
            );
            setAllRegistrations((prev) =>
              prev.some((r) => r.id === hydrated.id)
                ? prev.map((r) => (r.id === hydrated.id ? hydrated : r))
                : [hydrated, ...prev]
            );
            return hydrated;
          }
        } catch {
          // fall through to local memory lookup
        }
      }

      // 2. Local memory check (works in Preview Mode and when Supabase RPC isn't migrated yet)
      const localFound = allRegistrations.find((r) => {
        if (r.eventId !== eventId) return false;
        if (pNum && r.parentNumber && r.parentNumber.trim().toUpperCase() === pNum) return true;
        if (email && r.email && r.email.trim().toLowerCase() === email) return true;
        if (phoneDigits.length >= 6 && phonesMatch(r.phone, lookup.phone)) return true;
        return false;
      });

      return localFound || null;
    },
    [allRegistrations]
  );

  const createRegistration = useCallback(
    async (input: CreateRegistrationInput) => {
      const targetEventId = input.eventId || activeEvent.id;
      const targetEvent = events.find((e) => e.id === targetEventId) || activeEvent;
      const targetVenues = getVenuesForEvent(targetEventId);

      // Prevent duplicate registration for the same event (by Parent Number, Email, or Phone)
      if (input.fromInvitationPage) {
        const existing = await findExistingRegistration(targetEventId, {
          parentNumber: input.parentNumber,
          email: input.email,
          phone: input.phone,
        });
        if (existing) {
          return { duplicate: existing };
        }
      }

      setNextCounter((c) => c + 1);
      const regId = generateUniqueRegId();
      const partySize = Math.max(1, Math.min(20, Number(input.partySize) || 1));
      const nowIso = new Date().toISOString();

      const passes: AttendeePass[] = Array.from({ length: partySize }, (_, idx) => {
        const passIndex = idx + 1;
        const other = idx > 0 ? input.otherAttendees[idx - 1] : undefined;
        const label =
          idx === 0
            ? input.name.trim() || `Attendee 1`
            : other?.name?.trim() || `${input.name.trim() || 'Guest'} — Attendee ${passIndex}`;
        const contact =
          idx === 0
            ? input.phone.trim() || input.email.trim() || ''
            : other?.contact?.trim() || '';
        const age = (input.attendeeAges[idx] || '').trim();

        return {
          passCode: `${regId}-${passIndex}`,
          eventId: targetEventId,
          registrationId: regId,
          passIndex,
          totalPasses: partySize,
          attendeeLabel: label,
          attendeeAge: age,
          attendeeContact: contact,
          status: 'PENDING',
          usedAt: null,
          usedGate: null,
          scannedBy: null,
        };
      });

      const isContactDelivery = Boolean(
        input.fromInvitationPage && targetEvent.qrDeliveryMode === 'contact_info'
      );

      const registration: Registration = {
        id: regId,
        eventId: targetEventId,
        parentNumber: input.parentNumber.trim().toUpperCase(),
        name: input.name.trim() || 'Registered Invitee',
        phone: input.phone.trim(),
        email: input.email.trim(),
        schoolType: input.schoolType,
        schoolBranch: input.schoolBranch,
        schoolOther: input.schoolOther.trim(),
        category: input.category,
        assignedGate: input.assignedGate || targetVenues[0]?.name || 'Gate A - Main Campus Entrance',
        partySize,
        attendeeAges: input.attendeeAges.slice(0, partySize),
        otherAttendees: input.otherAttendees.slice(0, Math.max(0, partySize - 1)),
        notes: input.notes?.trim() || `${input.category} Registration`,
        deliveryMode: isContactDelivery ? 'contact_info' : 'on_screen',
        deliveryStatus: isContactDelivery ? 'sent' : 'displayed',
        registeredAt: nowIso,
        passes,
      };

      if (supabase) {
        const regRow = {
          id: registration.id,
          event_id: registration.eventId,
          parent_number: registration.parentNumber,
          name: registration.name,
          phone: registration.phone,
          email: registration.email,
          school_type: registration.schoolType,
          school_branch: registration.schoolBranch,
          school_other: registration.schoolOther,
          category: registration.category,
          assigned_gate: registration.assignedGate,
          party_size: registration.partySize,
          attendee_ages: registration.attendeeAges,
          other_attendees: registration.otherAttendees,
          notes: registration.notes,
          delivery_mode: registration.deliveryMode,
          delivery_status: registration.deliveryStatus,
          registered_at: registration.registeredAt,
        };

        let { error: regErr } = await supabase.from('registrations').insert(regRow);
        if (regErr && regErr.message.toLowerCase().includes('event_id')) {
          const { event_id: _omit, ...legacyRow } = regRow;
          const retry = await supabase.from('registrations').insert(legacyRow);
          regErr = retry.error;
        }
        if (regErr) {
          console.error('Supabase registration insert failed:', regErr);
          showToast(`Database save warning: ${regErr.message}`, 'error');
        }

        const passRows = passes.map((p) => ({
          pass_code: p.passCode,
          event_id: p.eventId,
          registration_id: p.registrationId,
          pass_index: p.passIndex,
          total_passes: p.totalPasses,
          attendee_label: p.attendeeLabel,
          attendee_age: p.attendeeAge,
          attendee_contact: p.attendeeContact,
          status: p.status,
        }));

        let { error: passErr } = await supabase.from('attendee_passes').insert(passRows);
        if (passErr && passErr.message.toLowerCase().includes('event_id')) {
          const legacyPassRows = passRows.map(({ event_id: _omit, ...rest }) => rest);
          const retry = await supabase.from('attendee_passes').insert(legacyPassRows);
          passErr = retry.error;
        }
        if (passErr) {
          console.error('Supabase attendee_passes insert failed:', passErr);
          showToast(`Pass save warning: ${passErr.message}`, 'error');
        }
      }

      let dispatchMessage: string | undefined;
      if (isContactDelivery) {
        const result = await dispatchQrPasses(registration);
        dispatchMessage = result.message;
        registration.deliveryStatus = result.ok ? 'sent' : 'queued';
      }

      setAllRegistrations((prev) => [registration, ...prev]);

      return { registration, dispatchMessage };
    },
    [activeEvent, dispatchQrPasses, events, findExistingRegistration, getVenuesForEvent, showToast]
  );

  const updateExistingRegistration = useCallback(
    async (
      registrationId: string,
      input: CreateRegistrationInput
    ): Promise<{ ok: boolean; registration?: Registration; dispatchMessage?: string; error?: string }> => {
      const targetEventId = input.eventId || activeEvent.id;
      const targetEvent = events.find((e) => e.id === targetEventId) || activeEvent;
      const existing = allRegistrations.find((r) => r.id === registrationId);
      const partySize = Math.max(1, Math.min(20, Number(input.partySize) || 1));

      if (existing) {
        const usedCount = existing.passes.filter((p) => p.status === 'USED').length;
        if (partySize < usedCount) {
          return {
            ok: false,
            error: `Cannot reduce attendees below ${usedCount} already checked-in pass(es).`,
          };
        }
      }

      // Build updated passes array preserving existing USED status & timestamps
      const existingByIdx = new Map<number, AttendeePass>();
      (existing?.passes || []).forEach((p) => existingByIdx.set(p.passIndex, p));

      const nextPasses: AttendeePass[] = Array.from({ length: partySize }, (_, idx) => {
        const passIndex = idx + 1;
        const prevPass = existingByIdx.get(passIndex);
        const other = idx > 0 ? input.otherAttendees[idx - 1] : undefined;
        const label =
          idx === 0
            ? input.name.trim() || existing?.name || 'Attendee 1'
            : other?.name?.trim() || `${input.name.trim() || 'Guest'} — Attendee ${passIndex}`;
        const contact =
          idx === 0
            ? input.phone.trim() || input.email.trim() || ''
            : other?.contact?.trim() || '';
        const age = (input.attendeeAges[idx] || '').trim();

        return {
          passCode: prevPass?.passCode || `${registrationId}-${passIndex}`,
          eventId: targetEventId,
          registrationId,
          passIndex,
          totalPasses: partySize,
          attendeeLabel: label,
          attendeeAge: age,
          attendeeContact: contact,
          status: prevPass?.status || 'PENDING',
          usedAt: prevPass?.usedAt || null,
          usedGate: prevPass?.usedGate || null,
          scannedBy: prevPass?.scannedBy || null,
        };
      });

      const isContactDelivery = Boolean(
        input.fromInvitationPage && targetEvent.qrDeliveryMode === 'contact_info'
      );

      let updatedReg: Registration = {
        id: registrationId,
        eventId: targetEventId,
        parentNumber: input.parentNumber.trim().toUpperCase(),
        name: input.name.trim() || existing?.name || 'Registered Invitee',
        phone: input.phone.trim(),
        email: input.email.trim(),
        schoolType: input.schoolType,
        schoolBranch: input.schoolBranch,
        schoolOther: input.schoolOther.trim(),
        category: existing?.category || input.category,
        assignedGate: existing?.assignedGate || input.assignedGate,
        partySize,
        attendeeAges: input.attendeeAges.slice(0, partySize),
        otherAttendees: input.otherAttendees.slice(0, Math.max(0, partySize - 1)),
        notes: input.notes?.trim() || existing?.notes || `${input.category} Registration`,
        deliveryMode: isContactDelivery ? 'contact_info' : 'on_screen',
        deliveryStatus: isContactDelivery ? 'sent' : 'displayed',
        registeredAt: existing?.registeredAt || new Date().toISOString(),
        passes: nextPasses,
      };

      if (supabase) {
        const { data, error } = await supabase.rpc('update_existing_registration', {
          p_registration_id: registrationId,
          p_event_id: targetEventId,
          p_payload: {
            parent_number: updatedReg.parentNumber,
            name: updatedReg.name,
            phone: updatedReg.phone,
            email: updatedReg.email,
            school_type: updatedReg.schoolType,
            school_branch: updatedReg.schoolBranch,
            school_other: updatedReg.schoolOther,
            party_size: updatedReg.partySize,
            attendee_ages: updatedReg.attendeeAges,
            other_attendees: updatedReg.otherAttendees,
            notes: updatedReg.notes,
            delivery_mode: updatedReg.deliveryMode,
            delivery_status: updatedReg.deliveryStatus,
          },
          p_passes: nextPasses.map((p) => ({
            pass_code: p.passCode,
            pass_index: p.passIndex,
            attendee_label: p.attendeeLabel,
            attendee_age: p.attendeeAge,
            attendee_contact: p.attendeeContact,
          })),
        });

        if (error) {
          return { ok: false, error: error.message };
        }
        if (data && data.registration) {
          updatedReg = hydrateRegistrationFromRpc(
            data.registration as Record<string, unknown>,
            Array.isArray(data.passes) ? (data.passes as Array<Record<string, unknown>>) : []
          );
        }
      }

      let dispatchMessage: string | undefined;
      if (isContactDelivery) {
        const result = await dispatchQrPasses(updatedReg);
        dispatchMessage = result.message;
        updatedReg.deliveryStatus = result.ok ? 'sent' : 'queued';
      }

      setAllRegistrations((prev) =>
        prev.some((r) => r.id === updatedReg.id)
          ? prev.map((r) => (r.id === updatedReg.id ? updatedReg : r))
          : [updatedReg, ...prev]
      );

      return { ok: true, registration: updatedReg, dispatchMessage };
    },
    [activeEvent, allRegistrations, dispatchQrPasses, events]
  );

  const importCsvRegistrations = useCallback(
    async (
      venueName: string,
      tier: 'VIP' | 'Parent',
      rows: Array<{
        parentNumber: string;
        name: string;
        phone: string;
        email?: string;
        partySize: number;
        schoolBranch?: string;
      }>
    ) => {
      const targetEventId = activeEvent.id;
      let counter = nextCounter;
      const created: Registration[] = [];
      const allPasses: AttendeePass[] = [];
      const nowIso = new Date().toISOString();

      for (const row of rows) {
        if (!row.name && !row.parentNumber) continue;
        const regId = generateUniqueRegId();
        counter++;
        const partySize = Math.max(1, Math.min(20, Number(row.partySize) || 1));
        const passes: AttendeePass[] = Array.from({ length: partySize }, (_, idx) => ({
          passCode: `${regId}-${idx + 1}`,
          eventId: targetEventId,
          registrationId: regId,
          passIndex: idx + 1,
          totalPasses: partySize,
          attendeeLabel: idx === 0 ? row.name : `${row.name} — Attendee ${idx + 1}`,
          attendeeAge: '',
          attendeeContact: idx === 0 ? row.phone : '',
          status: 'PENDING',
          usedAt: null,
          usedGate: null,
          scannedBy: null,
        }));

        const reg: Registration = {
          id: regId,
          eventId: targetEventId,
          parentNumber: (row.parentNumber || regId).toUpperCase(),
          name: row.name || row.parentNumber,
          phone: row.phone || '',
          email: row.email || '',
          schoolType: row.schoolBranch ? 'sabis_isc' : '',
          schoolBranch: row.schoolBranch || '',
          schoolOther: '',
          category: tier,
          assignedGate: venueName,
          partySize,
          attendeeAges: [],
          otherAttendees: [],
          notes: `Imported via ${tier} CSV for ${venueName}`,
          deliveryMode: activeEvent.qrDeliveryMode,
          deliveryStatus: 'displayed',
          registeredAt: nowIso,
          passes,
        };
        created.push(reg);
        allPasses.push(...passes);
      }

      if (created.length === 0) return 0;
      setNextCounter(counter);
      setAllRegistrations((prev) => [...created, ...prev]);

      if (supabase) {
        await supabase.from('registrations').insert(
          created.map((r) => ({
            id: r.id,
            event_id: r.eventId,
            parent_number: r.parentNumber,
            name: r.name,
            phone: r.phone,
            email: r.email,
            school_type: r.schoolType,
            school_branch: r.schoolBranch,
            school_other: r.schoolOther,
            category: r.category,
            assigned_gate: r.assignedGate,
            party_size: r.partySize,
            attendee_ages: r.attendeeAges,
            other_attendees: r.otherAttendees,
            notes: r.notes,
            delivery_mode: r.deliveryMode,
            delivery_status: r.deliveryStatus,
            registered_at: r.registeredAt,
          }))
        );
        await supabase.from('attendee_passes').insert(
          allPasses.map((p) => ({
            pass_code: p.passCode,
            event_id: p.eventId,
            registration_id: p.registrationId,
            pass_index: p.passIndex,
            total_passes: p.totalPasses,
            attendee_label: p.attendeeLabel,
            attendee_age: p.attendeeAge,
            attendee_contact: p.attendeeContact,
            status: p.status,
          }))
        );
      }

      return created.length;
    },
    [activeEvent.id, activeEvent.qrDeliveryMode, nextCounter]
  );

  const deleteRegistration = useCallback(async (regId: string) => {
    setAllRegistrations((prev) => prev.filter((r) => r.id !== regId));
    if (supabase) {
      await supabase.from('registrations').delete().eq('id', regId);
    }
  }, []);

  // ==================== GATE QR SCANNER (VALID / INVALID / USED + TIMING LOGS) ====================
  const recordScanLog = useCallback(async (log: ScanLog) => {
    setAllScanLogs((prev) => [log, ...prev].slice(0, 500));
    if (supabase) {
      const logRow = {
        event_id: log.eventId,
        scanned_at: log.scannedAt,
        pass_code: log.passCode,
        registration_id: log.registrationId,
        parent_number: log.parentNumber,
        attendee_name: log.attendeeName,
        tier: log.tier,
        gate: log.gate,
        status: log.status,
        message: log.message,
        first_used_at: log.firstUsedAt || null,
        scanned_by: log.scannedBy,
      };
      const { error } = await supabase.from('scan_logs').insert(logRow);
      if (error && error.message.toLowerCase().includes('event_id')) {
        const { event_id: _omit, ...legacyLog } = logRow;
        await supabase.from('scan_logs').insert(legacyLog);
      }
    }
  }, []);

  const scanQrCode = useCallback(
    async (rawInput: string, activeGate: string): Promise<ScanResult> => {
      const nowIso = new Date().toISOString();
      const scannerEmail = session?.email || 'gate-terminal';

      let token = rawInput.trim();
      let parsedPassCode = '';
      let parsedRegId = '';
      let parsedParentNumber = '';

      // 1. Parse compact format "SABIS:EVT-26-XXXXXX-1"
      if (token.toUpperCase().startsWith('SABIS:')) {
        parsedPassCode = token.slice(6).trim();
      } else if (token.startsWith('{')) {
        // 2. Parse legacy JSON QR payloads {"v":5|6, "passCode":"...", ...}
        try {
          const parsed = JSON.parse(token) as Record<string, unknown>;
          if (parsed.passCode) parsedPassCode = String(parsed.passCode).trim();
          if (parsed.regId) parsedRegId = String(parsed.regId).trim();
          if (parsed.id && !parsedRegId) parsedRegId = String(parsed.id).trim();
          if (parsed.parentNumber) parsedParentNumber = String(parsed.parentNumber).trim();
        } catch {
          // treat as raw code
        }
      } else {
        // 3. Extract embedded pass code / registration ID if wrapped in text or URL
        const passMatch = token.match(/EVT-[A-Z0-9]+-[A-Z0-9]+-\d+/i);
        if (passMatch) {
          parsedPassCode = passMatch[0].trim();
        } else {
          const regMatch = token.match(/EVT-[A-Z0-9]+-[A-Z0-9]+/i);
          if (regMatch) parsedRegId = regMatch[0].trim();
        }
      }

      const upperRaw = token.toUpperCase();
      const upperPass = (parsedPassCode || upperRaw).toUpperCase().trim();
      const lookupKey = (parsedRegId || parsedParentNumber || upperPass).toUpperCase().trim();
      const safePostgrestKey = lookupKey.replace(/[^A-Z0-9_-]/g, '');

      let matchedReg: Registration | null = null;
      let matchedPass: AttendeePass | null = null;

      // Helper to search a registration list by exact passCode, regId, or parentNumber
      const findInList = (list: Registration[]) => {
        for (const reg of list) {
          const foundPass = reg.passes.find((p) => p.passCode.toUpperCase() === upperPass);
          if (foundPass) return { reg, pass: foundPass };
        }
        const foundReg = list.find(
          (r) =>
            r.id.toUpperCase() === lookupKey ||
            (r.parentNumber && r.parentNumber.toUpperCase() === lookupKey)
        );
        if (foundReg) {
          const nextPass =
            foundReg.passes.find((p) => p.status === 'PENDING') || foundReg.passes[0] || null;
          return { reg: foundReg, pass: nextPass };
        }
        return null;
      };

      // Step A: Search active event first, then ALL events in memory (handles gate officer on another event)
      const localMatch = findInList(registrations) || findInList(allRegistrations);
      if (localMatch) {
        matchedReg = localMatch.reg;
        matchedPass = localMatch.pass;
      }

      // Step B: Live Supabase fallback lookup (immediately recognizes brand-new registrations before Realtime arrives!)
      if (!matchedReg && supabase) {
        try {
          const { data: passRow } = await supabase
            .from('attendee_passes')
            .select('*')
            .ilike('pass_code', upperPass)
            .maybeSingle();

          let regRow: Record<string, unknown> | null = null;
          if (passRow) {
            const { data: rData } = await supabase
              .from('registrations')
              .select('*')
              .eq('id', passRow.registration_id)
              .maybeSingle();
            regRow = rData;
          } else if (safePostgrestKey) {
            const { data: rData } = await supabase
              .from('registrations')
              .select('*')
              .or(`id.ilike.${safePostgrestKey},parent_number.ilike.${safePostgrestKey}`)
              .limit(1)
              .maybeSingle();
            regRow = rData;
          }

          if (regRow) {
            const regIdStr = String(regRow.id);
            const { data: regPasses } = await supabase
              .from('attendee_passes')
              .select('*')
              .eq('registration_id', regIdStr)
              .order('pass_index', { ascending: true });

            const mappedPasses: AttendeePass[] = (regPasses || []).map((p) => ({
              passCode: p.pass_code,
              eventId: p.event_id || String(regRow!.event_id || DEFAULT_EVENT_ID),
              registrationId: p.registration_id,
              passIndex: p.pass_index,
              totalPasses: p.total_passes,
              attendeeLabel: p.attendee_label || '',
              attendeeAge: p.attendee_age || '',
              attendeeContact: p.attendee_contact || '',
              status: p.status === 'USED' ? 'USED' : 'PENDING',
              usedAt: p.used_at,
              usedGate: p.used_gate,
              scannedBy: p.scanned_by,
            }));

            const hydratedReg: Registration = {
              id: regIdStr,
              eventId: String(regRow.event_id || DEFAULT_EVENT_ID),
              parentNumber: String(regRow.parent_number || ''),
              name: String(regRow.name || ''),
              phone: String(regRow.phone || ''),
              email: String(regRow.email || ''),
              schoolType: (regRow.school_type || '') as Registration['schoolType'],
              schoolBranch: String(regRow.school_branch || ''),
              schoolOther: String(regRow.school_other || ''),
              category: regRow.category === 'VIP' ? 'VIP' : 'Parent',
              assignedGate: String(regRow.assigned_gate || ''),
              partySize: Number(regRow.party_size) || 1,
              attendeeAges: Array.isArray(regRow.attendee_ages) ? (regRow.attendee_ages as string[]) : [],
              otherAttendees: Array.isArray(regRow.other_attendees)
                ? (regRow.other_attendees as OtherAttendeeDetail[])
                : [],
              notes: String(regRow.notes || ''),
              deliveryMode: regRow.delivery_mode === 'contact_info' ? 'contact_info' : 'on_screen',
              deliveryStatus: (regRow.delivery_status || 'displayed') as Registration['deliveryStatus'],
              registeredAt: String(regRow.registered_at || nowIso),
              passes: mappedPasses,
            };

            matchedReg = hydratedReg;
            matchedPass =
              mappedPasses.find((p) => p.passCode.toUpperCase() === upperPass) ||
              mappedPasses.find((p) => p.status === 'PENDING') ||
              mappedPasses[0] ||
              null;

            setAllRegistrations((prev) =>
              prev.some((r) => r.id === hydratedReg.id) ? prev : [hydratedReg, ...prev]
            );
          }
        } catch (err) {
          console.error('Live Supabase pass lookup failed:', err);
        }
      }

      if (!matchedReg || !matchedPass) {
        const log: ScanLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: activeEvent.id,
          scannedAt: nowIso,
          passCode: (parsedPassCode || token).slice(0, 32),
          registrationId: parsedRegId || '',
          parentNumber: parsedParentNumber || 'UNKNOWN',
          attendeeName: 'Unrecognized QR Code',
          tier: 'Unknown',
          gate: activeGate,
          status: 'INVALID',
          message: 'Invalid QR code — pass not found in event database',
          scannedBy: scannerEmail,
        };
        playScannerTone('INVALID', audioMuted);
        await recordScanLog(log);
        return {
          status: 'INVALID',
          scannedAt: nowIso,
          headline: 'INVALID QR — ACCESS DENIED',
          subtext: `Code "${(parsedPassCode || token).slice(0, 32)}" was not found in your authorized event database. Tap "Sync Passes" or verify the user registered for this event.`,
          registration: null,
          pass: null,
          activeGate,
        };
      }

      const passEvent = events.find((e) => e.id === matchedReg!.eventId) || activeEvent;
      const targetEventId = matchedReg.eventId || activeEvent.id;

      // Enforce event-specific authorization for Gate Control users (Control Admins can scan any event)
      if (
        session &&
        session.role !== 'control' &&
        !(session.allowedEventIds || []).includes(targetEventId)
      ) {
        const log: ScanLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: activeEvent.id,
          scannedAt: nowIso,
          passCode: matchedPass.passCode,
          registrationId: matchedReg.id,
          parentNumber: matchedReg.parentNumber,
          attendeeName: `${matchedPass.attendeeLabel} (Pass ${matchedPass.passIndex}/${matchedPass.totalPasses})`,
          tier: matchedReg.category,
          gate: activeGate,
          status: 'INVALID',
          message: `Unauthorized event — pass belongs to "${passEvent.name}"`,
          scannedBy: scannerEmail,
        };
        playScannerTone('INVALID', audioMuted);
        await recordScanLog(log);
        return {
          status: 'INVALID',
          scannedAt: nowIso,
          headline: 'INVALID — WRONG EVENT',
          subtext: `This pass belongs to "${passEvent.name}", which is not assigned to your gate scanner account.`,
          registration: matchedReg,
          pass: matchedPass,
          activeGate,
          eventName: passEvent.name,
        };
      }

      if (passEvent.strictGateMode && matchedReg.assignedGate !== activeGate) {
        const log: ScanLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: targetEventId,
          scannedAt: nowIso,
          passCode: matchedPass.passCode,
          registrationId: matchedReg.id,
          parentNumber: matchedReg.parentNumber,
          attendeeName: `${matchedPass.attendeeLabel} (Pass ${matchedPass.passIndex}/${matchedPass.totalPasses})`,
          tier: matchedReg.category,
          gate: activeGate,
          status: 'INVALID',
          message: `Wrong venue — pass assigned to ${matchedReg.assignedGate}`,
          scannedBy: scannerEmail,
        };
        playScannerTone('INVALID', audioMuted);
        await recordScanLog(log);
        return {
          status: 'INVALID',
          scannedAt: nowIso,
          headline: 'INVALID FOR THIS VENUE',
          subtext: `${matchedPass.attendeeLabel} is assigned to ${matchedReg.assignedGate}, not ${activeGate}.`,
          registration: matchedReg,
          pass: matchedPass,
          activeGate,
          eventName: passEvent.name,
        };
      }

      if (matchedPass.status === 'USED') {
        const log: ScanLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: targetEventId,
          scannedAt: nowIso,
          passCode: matchedPass.passCode,
          registrationId: matchedReg.id,
          parentNumber: matchedReg.parentNumber,
          attendeeName: `${matchedPass.attendeeLabel} (Pass ${matchedPass.passIndex}/${matchedPass.totalPasses})`,
          tier: matchedReg.category,
          gate: activeGate,
          status: 'USED',
          message: `QR pass already used at ${matchedPass.usedGate || matchedReg.assignedGate}`,
          firstUsedAt: matchedPass.usedAt,
          scannedBy: scannerEmail,
        };
        playScannerTone('USED', audioMuted);
        await recordScanLog(log);
        return {
          status: 'USED',
          scannedAt: nowIso,
          headline: 'USED — ALREADY SCANNED',
          subtext: `Pass ${matchedPass.passIndex} of ${matchedPass.totalPasses} (${matchedPass.attendeeLabel}) was already used at ${matchedPass.usedGate || matchedReg.assignedGate}.`,
          registration: matchedReg,
          pass: matchedPass,
          activeGate,
          eventName: passEvent.name,
          firstUsedAt: matchedPass.usedAt,
        };
      }

      const updatedPass: AttendeePass = {
        ...matchedPass,
        status: 'USED',
        usedAt: nowIso,
        usedGate: activeGate,
        scannedBy: scannerEmail,
      };

      setAllRegistrations((prev) =>
        prev.map((r) =>
          r.id === matchedReg!.id
            ? {
                ...r,
                passes: r.passes.map((p) => (p.passCode === updatedPass.passCode ? updatedPass : p)),
              }
            : r
        )
      );

      if (supabase) {
        const { error: updErr } = await supabase
          .from('attendee_passes')
          .update({
            status: 'USED',
            used_at: nowIso,
            used_gate: activeGate,
            scanned_by: scannerEmail,
          })
          .eq('pass_code', updatedPass.passCode);
        if (updErr) {
          console.error('Failed to mark pass USED in Supabase:', updErr);
        }
      }

      const log: ScanLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        eventId: targetEventId,
        scannedAt: nowIso,
        passCode: updatedPass.passCode,
        registrationId: matchedReg.id,
        parentNumber: matchedReg.parentNumber,
        attendeeName: `${updatedPass.attendeeLabel} (Pass ${updatedPass.passIndex}/${updatedPass.totalPasses})`,
        tier: matchedReg.category,
        gate: activeGate,
        status: 'VALID',
        message: `Valid ${matchedReg.category} pass checked in (${updatedPass.passIndex}/${updatedPass.totalPasses})`,
        scannedBy: scannerEmail,
      };

      playScannerTone('VALID', audioMuted);
      await recordScanLog(log);

      const updatedReg: Registration = {
        ...matchedReg,
        passes: matchedReg.passes.map((p) => (p.passCode === updatedPass.passCode ? updatedPass : p)),
      };

      return {
        status: 'VALID',
        scannedAt: nowIso,
        headline: 'VALID — ACCESS GRANTED ✓',
        subtext: `${updatedPass.attendeeLabel} (Pass ${updatedPass.passIndex} of ${updatedPass.totalPasses}) checked in at ${activeGate}.`,
        registration: updatedReg,
        pass: updatedPass,
        activeGate,
        eventName: passEvent.name,
      };
    },
    [activeEvent, allRegistrations, audioMuted, events, recordScanLog, registrations, session]
  );

  const clearScanLogs = useCallback(async () => {
    const eventId = activeEvent.id;
    setAllScanLogs((prev) => prev.filter((l) => l.eventId !== eventId));
    if (supabase) {
      await supabase.from('scan_logs').delete().eq('event_id', eventId);
    }
  }, [activeEvent.id]);

  const resetDemoData = useCallback(async () => {
    setEvents(DEFAULT_EVENTS);
    setActiveEventIdState(DEFAULT_EVENT_ID);
    setAllVenues(DEFAULT_VENUES);
    setAllRegistrations(DEFAULT_REGISTRATIONS);
    setAllScanLogs(DEFAULT_SCAN_LOGS);
    setNextCounter(1007);
    if (!isSupabaseConfigured) {
      setAuthorizedUsers(DEFAULT_AUTHORIZED_USERS);
    }
  }, []);

  const value: EventContextValue = {
    loading,
    isLiveSupabase: isSupabaseConfigured,
    allEvents: events,
    events: visibleEvents,
    hasAssignedEvents,
    activeEventId: activeEvent.id,
    activeEvent,
    setActiveEventId,
    getEventBySlugOrId,
    getVenuesForEvent,
    createEvent,
    renameEvent,
    deleteEvent,
    settings,
    venues,
    authorizedUsers,
    registrations,
    scanLogs,
    session,
    audioMuted,
    toast,
    showToast,
    toggleAudioMute,
    loginWithEmail,
    sendMagicLink,
    logout,
    updateSettings,
    updateFieldToggle,
    updateRequiredField,
    saveVenues,
    addAuthorizedUser,
    updateAuthorizedUser,
    removeAuthorizedUser,
    findExistingRegistration,
    createRegistration,
    updateExistingRegistration,
    importCsvRegistrations,
    deleteRegistration,
    resendQrPasses: dispatchQrPasses,
    scanQrCode,
    clearScanLogs,
    resetDemoData,
    refreshData: fetchSupabaseData,
  };

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
};

export function useEvent(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent must be used inside EventProvider');
  return ctx;
}

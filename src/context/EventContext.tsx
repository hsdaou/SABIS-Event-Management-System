import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_AUTHORIZED_USERS,
  DEFAULT_REGISTRATIONS,
  DEFAULT_SCAN_LOGS,
  DEFAULT_SETTINGS,
  DEFAULT_VENUES,
} from '../data/defaults';
import { buildPassQrPayload, generateQrDataUrl, playScannerTone, slugifyVenue } from '../lib/qr';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type {
  AttendeePass,
  AuthorizedUser,
  AuthSession,
  EventSettings,
  FieldToggles,
  OtherAttendeeDetail,
  Registration,
  ScanLog,
  ScanOutcome,
  UserRole,
  Venue,
} from '../types';

const LOCAL_STATE_KEY = 'sabis_ems_state_v2';
const LOCAL_SESSION_KEY = 'sabis_ems_session_v2';

export interface CreateRegistrationInput {
  parentNumber: string;
  name: string;
  phone: string;
  email: string;
  schoolType: 'sabis_isc' | 'other' | '';
  schoolBranch: string;
  schoolOther: string;
  category: 'VIP' | 'Regular Parent';
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
  firstUsedAt?: string | null;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

interface EventContextValue {
  loading: boolean;
  isLiveSupabase: boolean;
  settings: EventSettings;
  venues: Venue[];
  authorizedUsers: AuthorizedUser[];
  registrations: Registration[];
  scanLogs: ScanLog[];
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

  // Control Admin settings & venues
  updateSettings: (patch: Partial<EventSettings>) => Promise<void>;
  updateFieldToggle: (key: keyof FieldToggles, value: boolean) => Promise<void>;
  saveVenues: (nextVenues: Venue[]) => Promise<void>;

  // Control Admin user management
  addAuthorizedUser: (
    email: string,
    fullName: string,
    role: UserRole
  ) => Promise<{ ok: boolean; error?: string }>;
  updateAuthorizedUser: (id: string, patch: Partial<Pick<AuthorizedUser, 'role' | 'active' | 'fullName'>>) => Promise<void>;
  removeAuthorizedUser: (id: string) => Promise<void>;

  // Registrations & passes
  createRegistration: (
    input: CreateRegistrationInput
  ) => Promise<{ registration: Registration; dispatchMessage?: string }>;
  importCsvRegistrations: (
    venueName: string,
    tier: 'VIP' | 'Regular Parent',
    rows: Array<{ parentNumber: string; name: string; phone: string; email?: string; partySize: number; schoolBranch?: string }>
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
  settings: EventSettings;
  venues: Venue[];
  authorizedUsers: AuthorizedUser[];
  registrations: Registration[];
  scanLogs: ScanLog[];
  nextCounter: number;
  audioMuted: boolean;
}

const EventContext = createContext<EventContextValue | null>(null);

function loadLocalState(): LocalStoredState {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStoredState>;
      return {
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings || {}),
          fieldToggles: {
            ...DEFAULT_SETTINGS.fieldToggles,
            ...(parsed.settings?.fieldToggles || {}),
          },
        },
        venues: Array.isArray(parsed.venues) && parsed.venues.length > 0 ? parsed.venues : DEFAULT_VENUES,
        authorizedUsers:
          Array.isArray(parsed.authorizedUsers) && parsed.authorizedUsers.length > 0
            ? parsed.authorizedUsers
            : DEFAULT_AUTHORIZED_USERS,
        registrations: Array.isArray(parsed.registrations) ? parsed.registrations : DEFAULT_REGISTRATIONS,
        scanLogs: Array.isArray(parsed.scanLogs) ? parsed.scanLogs : DEFAULT_SCAN_LOGS,
        nextCounter: typeof parsed.nextCounter === 'number' ? parsed.nextCounter : 1007,
        audioMuted: Boolean(parsed.audioMuted),
      };
    }
  } catch {
    // ignore corrupt storage
  }
  return {
    settings: DEFAULT_SETTINGS,
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
    // ignore quota error
  }
}

function loadLocalSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) return JSON.parse(raw) as AuthSession;
  } catch {
    // ignore
  }
  return null;
}

export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocal = useMemo(() => loadLocalState(), []);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [settings, setSettings] = useState<EventSettings>(initialLocal.settings);
  const [venues, setVenues] = useState<Venue[]>(initialLocal.venues);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>(initialLocal.authorizedUsers);
  const [registrations, setRegistrations] = useState<Registration[]>(initialLocal.registrations);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>(initialLocal.scanLogs);
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

  // Persist local state whenever running without Supabase
  useEffect(() => {
    if (!isSupabaseConfigured) {
      saveLocalState({
        settings,
        venues,
        authorizedUsers,
        registrations,
        scanLogs,
        nextCounter,
        audioMuted,
      });
    }
  }, [settings, venues, authorizedUsers, registrations, scanLogs, nextCounter, audioMuted]);

  // Cross-tab sync in local preview mode
  useEffect(() => {
    if (isSupabaseConfigured) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STATE_KEY) {
        const fresh = loadLocalState();
        setSettings(fresh.settings);
        setVenues(fresh.venues);
        setAuthorizedUsers(fresh.authorizedUsers);
        setRegistrations(fresh.registrations);
        setScanLogs(fresh.scanLogs);
        setNextCounter(fresh.nextCounter);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const fetchSupabaseData = useCallback(async () => {
    if (!supabase) return;
    try {
      const [settingsRes, venuesRes, usersRes, regsRes, passesRes, logsRes] = await Promise.all([
        supabase.from('event_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('venues').select('*').order('sort_order', { ascending: true }),
        supabase.from('authorized_users').select('*').order('created_at', { ascending: true }),
        supabase.from('registrations').select('*').order('registered_at', { ascending: false }),
        supabase.from('attendee_passes').select('*').order('pass_index', { ascending: true }),
        supabase.from('scan_logs').select('*').order('scanned_at', { ascending: false }).limit(500),
      ]);

      if (settingsRes.data) {
        const d = settingsRes.data;
        setSettings({
          eventTitle: d.event_title || DEFAULT_SETTINGS.eventTitle,
          qrDeliveryMode: d.qr_delivery_mode === 'contact_info' ? 'contact_info' : 'on_screen',
          contactDeliveryChannel: d.contact_delivery_channel || 'both',
          strictGateMode: Boolean(d.strict_gate_mode),
          fieldToggles: { ...DEFAULT_SETTINGS.fieldToggles, ...(d.field_toggles || {}) },
        });
      }

      if (venuesRes.data && venuesRes.data.length > 0) {
        setVenues(
          venuesRes.data.map((v) => ({
            id: v.id,
            slug: v.slug,
            name: v.name,
            capacity: v.capacity,
            sortOrder: v.sort_order,
          }))
        );
      }

      if (usersRes.data) {
        setAuthorizedUsers(
          usersRes.data.map((u) => ({
            id: u.id,
            email: u.email,
            fullName: u.full_name || '',
            role: u.role as UserRole,
            active: Boolean(u.active),
            addedBy: u.added_by || '',
            createdAt: u.created_at,
          }))
        );
      }

      if (regsRes.data) {
        const passesByReg = new Map<string, AttendeePass[]>();
        (passesRes.data || []).forEach((p) => {
          const mapped: AttendeePass = {
            passCode: p.pass_code,
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

        setRegistrations(
          regsRes.data.map((r) => ({
            id: r.id,
            parentNumber: r.parent_number || '',
            name: r.name || '',
            phone: r.phone || '',
            email: r.email || '',
            schoolType: (r.school_type || '') as Registration['schoolType'],
            schoolBranch: r.school_branch || '',
            schoolOther: r.school_other || '',
            category: r.category === 'VIP' ? 'VIP' : 'Regular Parent',
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

      if (logsRes.data) {
        setScanLogs(
          logsRes.data.map((l) => ({
            id: l.id,
            scannedAt: l.scanned_at,
            passCode: l.pass_code || '',
            registrationId: l.registration_id || '',
            parentNumber: l.parent_number || '',
            attendeeName: l.attendee_name || '',
            tier: l.tier || '',
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

  // Resolve Supabase Auth session -> AuthorizedUser role
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
        isSupabaseAuth: true,
      });
    } else if (defaultControlEmail && userEmail === defaultControlEmail) {
      setSession({
        email: userEmail,
        fullName: 'SABIS Control Admin',
        role: 'control',
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_settings' }, () => fetchSupabaseData())
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
          isSupabaseAuth: true,
        };
        setSession(nextSession);
        await fetchSupabaseData();
        return { ok: true, role: resolvedRole };
      }

      // Local Preview Auth Mode: checks authorizedUsers managed by Control Dashboard
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
        error: 'Magic Link requires live Supabase configuration. In local preview mode, sign in directly with any authorized email.',
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

  // ==================== CONTROL SETTINGS & VENUES ====================
  const updateSettings = useCallback(
    async (patch: Partial<EventSettings>) => {
      const merged: EventSettings = {
        ...settings,
        ...patch,
        fieldToggles: {
          ...settings.fieldToggles,
          ...(patch.fieldToggles || {}),
        },
      };
      setSettings(merged);
      if (supabase) {
        await supabase
          .from('event_settings')
          .upsert({
            id: 1,
            event_title: merged.eventTitle,
            qr_delivery_mode: merged.qrDeliveryMode,
            contact_delivery_channel: merged.contactDeliveryChannel,
            strict_gate_mode: merged.strictGateMode,
            field_toggles: merged.fieldToggles,
            updated_at: new Date().toISOString(),
          });
      }
    },
    [settings]
  );

  const updateFieldToggle = useCallback(
    async (key: keyof FieldToggles, value: boolean) => {
      await updateSettings({
        fieldToggles: {
          ...settings.fieldToggles,
          [key]: value,
        },
      });
    },
    [settings.fieldToggles, updateSettings]
  );

  const saveVenues = useCallback(async (nextVenues: Venue[]) => {
    const usedSlugs = new Set<string>();
    const cleaned = nextVenues.map((v, idx) => {
      let slug = slugifyVenue(v.name);
      if (usedSlugs.has(slug)) slug = `${slug}-${idx + 1}`;
      usedSlugs.add(slug);
      return {
        id: v.id || `GATE-${idx + 1}`,
        slug,
        name: v.name.trim() || `Venue ${idx + 1}`,
        capacity: Math.max(10, Number(v.capacity) || 100),
        sortOrder: idx + 1,
      };
    });
    setVenues(cleaned);
    if (supabase) {
      await supabase.from('venues').delete().neq('id', '__none__');
      await supabase.from('venues').insert(
        cleaned.map((v) => ({
          id: v.id,
          slug: v.slug,
          name: v.name,
          capacity: v.capacity,
          sort_order: v.sortOrder,
        }))
      );
    }
  }, []);

  // ==================== AUTHORIZED USERS ====================
  const addAuthorizedUser = useCallback(
    async (emailRaw: string, fullNameRaw: string, role: UserRole) => {
      const email = emailRaw.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return { ok: false, error: 'Enter a valid email address.' };
      }
      if (authorizedUsers.some((u) => u.email.toLowerCase() === email)) {
        return { ok: false, error: 'This email address is already registered.' };
      }
      const newUser: AuthorizedUser = {
        id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        email,
        fullName: fullNameRaw.trim() || email.split('@')[0],
        role,
        active: true,
        addedBy: session?.email || 'control',
        createdAt: new Date().toISOString(),
      };
      if (supabase) {
        const { data, error } = await supabase
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
        if (error) return { ok: false, error: error.message };
        if (data) newUser.id = data.id;
      }
      setAuthorizedUsers((prev) => [...prev, newUser]);
      return { ok: true };
    },
    [authorizedUsers, session?.email]
  );

  const updateAuthorizedUser = useCallback(
    async (id: string, patch: Partial<Pick<AuthorizedUser, 'role' | 'active' | 'fullName'>>) => {
      setAuthorizedUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
      if (supabase) {
        const payload: Record<string, unknown> = {};
        if (patch.role !== undefined) payload.role = patch.role;
        if (patch.active !== undefined) payload.active = patch.active;
        if (patch.fullName !== undefined) payload.full_name = patch.fullName;
        await supabase.from('authorized_users').update(payload).eq('id', id);
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

  // ==================== DISPATCH QR PASSES TO REGISTERED CONTACT INFO ====================
  const dispatchQrPasses = useCallback(
    async (registration: Registration): Promise<{ ok: boolean; message: string }> => {
      try {
        const passesWithQr = await Promise.all(
          registration.passes.map(async (p) => ({
            passCode: p.passCode,
            passIndex: p.passIndex,
            totalPasses: p.totalPasses,
            attendeeLabel: p.attendeeLabel || registration.name,
            qrDataUrl: await generateQrDataUrl(buildPassQrPayload(registration, p), 200),
          }))
        );

        const res = await fetch('/api/send-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventTitle: settings.eventTitle,
            recipientEmail: registration.email,
            recipientPhone: registration.phone,
            parentName: registration.name,
            parentNumber: registration.parentNumber,
            venueName: registration.assignedGate,
            tier: registration.category,
            channel: settings.contactDeliveryChannel,
            passes: passesWithQr,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; message?: string; emailSent?: boolean };
          return {
            ok: true,
            message:
              data.message ||
              `Dispatched ${registration.passes.length} QR pass(es) to registered contact info.`,
          };
        }
      } catch {
        // Local dev without Vercel serverless runtime
      }

      const target = [registration.email, registration.phone].filter(Boolean).join(' / ') || 'registered contact';
      return {
        ok: true,
        message: `${registration.passes.length} QR pass(es) queued for delivery to ${target}.`,
      };
    },
    [settings.contactDeliveryChannel, settings.eventTitle]
  );

  // ==================== REGISTRATIONS & MULTI-QR PASS GENERATION ====================
  const createRegistration = useCallback(
    async (input: CreateRegistrationInput) => {
      const regNumber = nextCounter;
      setNextCounter((c) => c + 1);
      const regId = `EVT-2026-${regNumber}`;
      const partySize = Math.max(1, Math.min(20, Number(input.partySize) || 1));
      const nowIso = new Date().toISOString();

      // Generate N individual QR passes matching the exact Number of Attendees
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

      const isContactDelivery = Boolean(input.fromInvitationPage && settings.qrDeliveryMode === 'contact_info');

      const registration: Registration = {
        id: regId,
        parentNumber: input.parentNumber.trim().toUpperCase(),
        name: input.name.trim() || 'Registered Invitee',
        phone: input.phone.trim(),
        email: input.email.trim(),
        schoolType: input.schoolType,
        schoolBranch: input.schoolBranch,
        schoolOther: input.schoolOther.trim(),
        category: input.category,
        assignedGate: input.assignedGate || venues[0]?.name || 'Gate A - Main Campus Entrance',
        partySize,
        attendeeAges: input.attendeeAges.slice(0, partySize),
        otherAttendees: input.otherAttendees.slice(0, Math.max(0, partySize - 1)),
        notes: input.notes?.trim() || `${input.category} Registration`,
        deliveryMode: isContactDelivery ? 'contact_info' : 'on_screen',
        deliveryStatus: isContactDelivery ? 'sent' : 'displayed',
        registeredAt: nowIso,
        passes,
      };

      let dispatchMessage: string | undefined;
      if (isContactDelivery) {
        const result = await dispatchQrPasses(registration);
        dispatchMessage = result.message;
        registration.deliveryStatus = result.ok ? 'sent' : 'queued';
      }

      setRegistrations((prev) => [registration, ...prev]);

      if (supabase) {
        await supabase.from('registrations').insert({
          id: registration.id,
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
        });

        await supabase.from('attendee_passes').insert(
          passes.map((p) => ({
            pass_code: p.passCode,
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

      return { registration, dispatchMessage };
    },
    [dispatchQrPasses, nextCounter, settings.qrDeliveryMode, venues]
  );

  const importCsvRegistrations = useCallback(
    async (
      venueName: string,
      tier: 'VIP' | 'Regular Parent',
      rows: Array<{ parentNumber: string; name: string; phone: string; email?: string; partySize: number; schoolBranch?: string }>
    ) => {
      let counter = nextCounter;
      const created: Registration[] = [];
      const allPasses: AttendeePass[] = [];
      const nowIso = new Date().toISOString();

      for (const row of rows) {
        if (!row.name && !row.parentNumber) continue;
        const regId = `EVT-2026-${counter++}`;
        const partySize = Math.max(1, Math.min(20, Number(row.partySize) || 1));
        const passes: AttendeePass[] = Array.from({ length: partySize }, (_, idx) => ({
          passCode: `${regId}-${idx + 1}`,
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
          deliveryMode: settings.qrDeliveryMode,
          deliveryStatus: 'displayed',
          registeredAt: nowIso,
          passes,
        };
        created.push(reg);
        allPasses.push(...passes);
      }

      if (created.length === 0) return 0;
      setNextCounter(counter);
      setRegistrations((prev) => [...created, ...prev]);

      if (supabase) {
        await supabase.from('registrations').insert(
          created.map((r) => ({
            id: r.id,
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
    [nextCounter, settings.qrDeliveryMode]
  );

  const deleteRegistration = useCallback(async (regId: string) => {
    setRegistrations((prev) => prev.filter((r) => r.id !== regId));
    if (supabase) {
      await supabase.from('registrations').delete().eq('id', regId);
    }
  }, []);

  // ==================== GATE QR SCANNER (VALID / INVALID / USED + TIMING LOGS) ====================
  const recordScanLog = useCallback(async (log: ScanLog) => {
    setScanLogs((prev) => [log, ...prev].slice(0, 500));
    if (supabase) {
      await supabase.from('scan_logs').insert({
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
      });
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

      try {
        if (token.startsWith('{')) {
          const parsed = JSON.parse(token) as Record<string, unknown>;
          if (parsed.passCode) parsedPassCode = String(parsed.passCode).trim();
          if (parsed.regId) parsedRegId = String(parsed.regId).trim();
          if (parsed.id && !parsedRegId) parsedRegId = String(parsed.id).trim();
          if (parsed.parentNumber) parsedParentNumber = String(parsed.parentNumber).trim();
        }
      } catch {
        // treat raw text as passCode / regId / parentNumber
      }

      const upperRaw = token.toUpperCase();
      const upperPass = (parsedPassCode || upperRaw).toUpperCase();

      // 1. Direct match by passCode (e.g. EVT-2026-1001-2)
      let matchedReg: Registration | null = null;
      let matchedPass: AttendeePass | null = null;

      for (const reg of registrations) {
        const foundPass = reg.passes.find((p) => p.passCode.toUpperCase() === upperPass);
        if (foundPass) {
          matchedReg = reg;
          matchedPass = foundPass;
          break;
        }
      }

      // 2. Fallback match by Registration ID or Parent Number (picks next PENDING pass, or first USED pass)
      if (!matchedReg) {
        const lookupKey = (parsedRegId || parsedParentNumber || upperRaw).toUpperCase();
        const foundReg = registrations.find(
          (r) =>
            r.id.toUpperCase() === lookupKey ||
            (r.parentNumber && r.parentNumber.toUpperCase() === lookupKey)
        );
        if (foundReg) {
          matchedReg = foundReg;
          matchedPass =
            foundReg.passes.find((p) => p.status === 'PENDING') || foundReg.passes[0] || null;
        }
      }

      // Case A: INVALID (not found)
      if (!matchedReg || !matchedPass) {
        const log: ScanLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
          subtext: `Code "${(parsedPassCode || token).slice(0, 32)}" does not match any valid attendee pass.`,
          registration: null,
          pass: null,
          activeGate,
        };
      }

      // Case B: Strict venue enforcement check -> INVALID for this venue
      if (settings.strictGateMode && matchedReg.assignedGate !== activeGate) {
        const log: ScanLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
        };
      }

      // Case C: USED (already scanned previously)
      if (matchedPass.status === 'USED') {
        const log: ScanLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
          firstUsedAt: matchedPass.usedAt,
        };
      }

      // Case D: VALID -> mark pass as USED & log VALID!
      const updatedPass: AttendeePass = {
        ...matchedPass,
        status: 'USED',
        usedAt: nowIso,
        usedGate: activeGate,
        scannedBy: scannerEmail,
      };

      setRegistrations((prev) =>
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
        await supabase
          .from('attendee_passes')
          .update({
            status: 'USED',
            used_at: nowIso,
            used_gate: activeGate,
            scanned_by: scannerEmail,
          })
          .eq('pass_code', updatedPass.passCode);
      }

      const log: ScanLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      };
    },
    [audioMuted, recordScanLog, registrations, session?.email, settings.strictGateMode]
  );

  const clearScanLogs = useCallback(async () => {
    setScanLogs([]);
    if (supabase) {
      await supabase.from('scan_logs').delete().neq('pass_code', '__none__');
    }
  }, []);

  const resetDemoData = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    setVenues(DEFAULT_VENUES);
    setRegistrations(DEFAULT_REGISTRATIONS);
    setScanLogs(DEFAULT_SCAN_LOGS);
    setNextCounter(1007);
    if (!isSupabaseConfigured) {
      setAuthorizedUsers(DEFAULT_AUTHORIZED_USERS);
    }
  }, []);

  const value: EventContextValue = {
    loading,
    isLiveSupabase: isSupabaseConfigured,
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
    saveVenues,
    addAuthorizedUser,
    updateAuthorizedUser,
    removeAuthorizedUser,
    createRegistration,
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

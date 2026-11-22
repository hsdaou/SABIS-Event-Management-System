import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Mail,
  Phone,
  Plus,
  QrCode,
  Save,
  Settings2,
  Shield,
  Sliders,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { EventLogsPanel } from '../components/EventLogsPanel';
import { KpiStrip } from '../components/KpiStrip';
import { LiveAttendanceView } from '../components/LiveAttendanceView';
import { PassInspectorModal } from '../components/PassInspectorModal';
import { TopBar } from '../components/TopBar';
import { useEvent } from '../context/EventContext';
import { slugifyVenue } from '../lib/qr';
import type { FieldToggles, Registration, UserRole, Venue } from '../types';

type ControlTab = 'form' | 'venues' | 'users' | 'attendance' | 'logs';

interface FieldToggleDescriptor {
  key: keyof FieldToggles;
  label: string;
  description: string;
  group: 'current' | 'extra';
}

const OTHER_FIELD_TOGGLES: FieldToggleDescriptor[] = [
  {
    key: 'parentNumber',
    label: 'Parent Number',
    description: 'Unique parent identifier field (e.g., PAR-10421)',
    group: 'current',
  },
  {
    key: 'fullName',
    label: 'Full Name',
    description: 'Primary parent or invitee full name',
    group: 'current',
  },
  {
    key: 'numAttendees',
    label: 'Number of Attendees',
    description: 'Controls how many individual SABIS® QR codes are generated/sent (1 per attendee)',
    group: 'current',
  },
  {
    key: 'school',
    label: 'Which school are your kids attending?',
    description: 'Shows SABIS® / ISC (12 UAE branches dropdown) or Other School selector',
    group: 'extra',
  },
  {
    key: 'attendeeAges',
    label: 'Age of Attendees',
    description: 'Dynamic age fields matching the selected Number of Attendees',
    group: 'extra',
  },
  {
    key: 'otherAttendeeContacts',
    label: 'Contact Details of the Other Attendee',
    description: 'Name & phone/email fields for each accompanying attendee when count > 1',
    group: 'extra',
  },
];

export const ControlDashboardPage: React.FC = () => {
  const {
    events,
    activeEvent,
    setActiveEventId,
    createEvent,
    renameEvent,
    deleteEvent,
    settings,
    venues,
    authorizedUsers,
    registrations,
    scanLogs,
    session,
    updateSettings,
    updateFieldToggle,
    updateRequiredField,
    saveVenues,
    addAuthorizedUser,
    updateAuthorizedUser,
    removeAuthorizedUser,
    importCsvRegistrations,
    deleteRegistration,
    clearScanLogs,
    resetDemoData,
    showToast,
  } = useEvent();

  const [activeTab, setActiveTab] = useState<ControlTab>('form');
  const [inspectingReg, setInspectingReg] = useState<Registration | null>(null);

  // Create New Event modal state
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');

  // Venue & Event Settings Draft State (synced with activeEvent)
  const [eventTitleDraft, setEventTitleDraft] = useState(activeEvent.name);
  const [eventDateDraft, setEventDateDraft] = useState(activeEvent.eventDate);
  const [venueDrafts, setVenueDrafts] = useState<Venue[]>(venues);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState(120);

  // User Access Form State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('regular');
  const [userError, setUserError] = useState('');

  // Email delivery health status
  const [emailStatus, setEmailStatus] = useState<{
    checked: boolean;
    configured: boolean;
    provider: string;
    senderEmail: string;
  }>({ checked: false, configured: false, provider: 'none', senderEmail: 'hsdaou@gmail.com' });
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  useEffect(() => {
    fetch('/api/send-qr')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.configured === 'boolean') {
          setEmailStatus({
            checked: true,
            configured: data.configured,
            provider: data.provider || 'none',
            senderEmail: data.senderEmail || 'hsdaou@gmail.com',
          });
        }
      })
      .catch(() => {
        setEmailStatus((prev) => ({ ...prev, checked: true }));
      });
  }, []);

  const handleSendTestEmail = async () => {
    const to = session?.email || emailStatus.senderEmail || 'hsdaou@gmail.com';
    setSendingTestEmail(true);
    try {
      const res = await fetch('/api/send-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testOnly: true, recipientEmail: to }),
      });
      const data = (await res.json()) as { ok?: boolean; emailSent?: boolean; message?: string; error?: string };
      if (data.emailSent) {
        showToast(data.message || `Test email sent to ${to}!`, 'success');
      } else {
        showToast(data.error || 'Could not send test email.', 'error');
      }
    } catch {
      showToast('Email API is available once deployed on Vercel.', 'warning');
    } finally {
      setSendingTestEmail(false);
    }
  };

  useEffect(() => {
    setEventTitleDraft(activeEvent.name);
    setEventDateDraft(activeEvent.eventDate);
    setVenueDrafts(venues);
  }, [activeEvent.eventDate, activeEvent.id, activeEvent.name, venues]);

  const handleCreateEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) {
      showToast('Please enter a name for the new event.', 'warning');
      return;
    }
    const created = await createEvent(newEventName, newEventDate);
    setNewEventName('');
    setNewEventDate('');
    setShowCreateEventModal(false);
    showToast(`Created new event "${created.name}"!`, 'success');
  };

  const getInvitationUrl = (venue: Venue, tier: 'parent' | 'vip') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/register?event=${encodeURIComponent(activeEvent.slug)}&venue=${encodeURIComponent(
      venue.slug
    )}&tier=${tier}`;
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label, 'success');
    } catch {
      showToast(text, 'info');
    }
  };

  const handleAddVenueRow = () => {
    if (!newVenueName.trim()) {
      showToast('Enter a venue name first.', 'warning');
      return;
    }
    const next: Venue = {
      id: `GATE-${activeEvent.id}-${Date.now().toString().slice(-4)}`,
      eventId: activeEvent.id,
      slug: slugifyVenue(newVenueName),
      name: newVenueName.trim(),
      capacity: Math.max(10, Number(newVenueCapacity) || 100),
    };
    setVenueDrafts((prev) => [...prev, next]);
    setNewVenueName('');
    setNewVenueCapacity(120);
  };

  const handleSaveVenueSettings = async () => {
    if (venueDrafts.length === 0) {
      showToast('At least one venue is required.', 'warning');
      return;
    }
    await renameEvent(activeEvent.id, eventTitleDraft.trim() || activeEvent.name, eventDateDraft);
    await saveVenues(venueDrafts);
    showToast('Event name & venue settings saved!', 'success');
  };

  const downloadSampleCsv = () => {
    const rows = [
      'ParentNumber,Name,PhoneNumber,NumberOfAttendees,Email,SchoolBranch',
      'PAR-13001,Huda Al-Suwaidi,+971 50 111 2233,2,huda@example.com,"ISC – Abu Dhabi: Khalifa City, Abu Dhabi"',
      'PAR-13002,Youssef Karam,+971 52 444 5566,3,youssef@example.com,"SIS – Yas Island: Yas Island, Abu Dhabi"',
      'PAR-13003,Lina Barakat,+971 55 777 8899,1,lina@example.com,"ISC – Dubai: Hessa Street, Al Sufouh 2, Jumeirah, Dubai"',
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sabis_venue_parents_template.csv';
    link.click();
    showToast('Downloaded sample CSV template', 'success');
  };

  const handleVenueCsvUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    venue: Venue,
    tier: 'VIP' | 'Parent'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = String(ev.target?.result || '');
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        showToast('CSV file has no data rows.', 'warning');
        return;
      }
      const parsed = lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        return {
          parentNumber: cols[0] || '',
          name: cols[1] || '',
          phone: cols[2] || '',
          partySize: Math.max(1, parseInt(cols[3], 10) || 1),
          email: cols[4] || '',
          schoolBranch: cols[5] || '',
        };
      });
      const count = await importCsvRegistrations(venue.name, tier, parsed);
      showToast(`Imported ${count} ${tier} registration(s) for ${venue.name}!`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    const res = await addAuthorizedUser(newUserEmail, newUserName, newUserRole);
    if (!res.ok) {
      setUserError(res.error || 'Could not add user.');
      return;
    }
    showToast(`Added ${newUserEmail} as ${newUserRole.toUpperCase()} user`, 'success');
    setNewUserEmail('');
    setNewUserName('');
  };

  const tierCounts = useMemo(
    () => ({
      regular: authorizedUsers.filter((u) => u.role === 'regular').length,
      gate: authorizedUsers.filter((u) => u.role === 'gate').length,
      control: authorizedUsers.filter((u) => u.role === 'control').length,
    }),
    [authorizedUsers]
  );

  const currentFields = OTHER_FIELD_TOGGLES.filter((f) => f.group === 'current');
  const extraFields = OTHER_FIELD_TOGGLES.filter((f) => f.group === 'extra');

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4F2]">
      <TopBar />

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Multi-Event Management Banner (Control Dashboard Exclusive) */}
        <div className="glass-panel rounded-2xl p-4 sm:p-5 border-l-4 border-l-[#016836] flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#DFF0D8] text-[#016836] border border-[#016836]/25">
                Active Event ({events.length} Total)
              </span>
              {activeEvent.eventDate && (
                <span className="text-xs font-mono text-[#7B6E65]">{activeEvent.eventDate}</span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#26211E] truncate">{activeEvent.name}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Switch Managed Event"
              value={activeEvent.id}
              onChange={(e) => setActiveEventId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] text-xs font-semibold text-[#26211E] focus:outline-none focus:border-[#016836]"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowCreateEventModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white shadow-sm flex items-center gap-1.5 transition"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Create New Event</span>
            </button>

            {events.length > 1 && (
              <button
                type="button"
                onClick={async () => {
                  const name = activeEvent.name;
                  await deleteEvent(activeEvent.id);
                  showToast(`Deleted event "${name}"`, 'info');
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#F2DEDE] hover:bg-[#E53C2E] hover:text-white text-[#E53C2E] border border-[#E53C2E]/30 flex items-center gap-1 transition"
                title="Delete Active Event"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete Event</span>
              </button>
            )}
          </div>
        </div>

        {/* Control Dashboard Sub-Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#016836]">
              SABIS® Administrator Control Center
            </span>
            <h3 className="text-lg font-bold text-[#26211E]">Control Dashboard</h3>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-xl border border-[#E3DBD3] shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'form'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>1. Form &amp; QR Controls</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('venues')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'venues'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>2. Venues, Links &amp; CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'users'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>3. User Access ({authorizedUsers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'attendance'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>4. Live Attendance</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'logs'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>5. Event Logs ({scanLogs.length})</span>
            </button>
          </nav>
        </div>

        {/* ==================== TAB 1: FORM FIELDS, SEPARATE PHONE/EMAIL REQUIREMENTS & QR DELIVERY ==================== */}
        {activeTab === 'form' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Field Visibility & Required Toggles */}
            <div className="lg:col-span-7 space-y-5">
              {/* Dedicated Separate Phone Number & Email Controls */}
              <div className="glass-panel rounded-2xl p-5 sm:p-6 border-t-4 border-t-[#016836] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3DBD3] pb-3.5">
                  <div>
                    <h3 className="text-base font-bold text-[#26211E]">
                      Separate Phone Number &amp; Email Controls
                    </h3>
                    <p className="text-xs text-[#7B6E65] mt-0.5">
                      Control whether Phone Number and Email appear on the Registration Portal and choose which one is required
                    </p>
                  </div>
                  <a
                    href={`/register?event=${encodeURIComponent(activeEvent.slug)}&venue=${encodeURIComponent(
                      venues[0]?.slug || ''
                    )}&tier=parent`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#EDF6F1] hover:bg-[#DFF0D8] text-[#016836] border border-[#016836]/25 flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Preview Invitation Page</span>
                  </a>
                </div>

                {/* Quick Presets for Required Contact Field */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#7B6E65] mr-1">Quick Requirement:</span>
                  <button
                    type="button"
                    onClick={() => {
                      updateSettings({
                        fieldToggles: { ...settings.fieldToggles, phone: true, email: true },
                        requiredFields: { ...settings.requiredFields, phone: true, email: false },
                      });
                      showToast('Phone Number set to Required; Email set to Optional', 'success');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                      settings.requiredFields.phone && !settings.requiredFields.email
                        ? 'bg-[#016836] text-white border-[#016836]'
                        : 'bg-[#F7F4F2] text-[#26211E] border-[#E3DBD3] hover:border-[#016836]'
                    }`}
                  >
                    Phone Required Only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSettings({
                        fieldToggles: { ...settings.fieldToggles, phone: true, email: true },
                        requiredFields: { ...settings.requiredFields, phone: false, email: true },
                      });
                      showToast('Email set to Required; Phone Number set to Optional', 'success');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                      !settings.requiredFields.phone && settings.requiredFields.email
                        ? 'bg-[#016836] text-white border-[#016836]'
                        : 'bg-[#F7F4F2] text-[#26211E] border-[#E3DBD3] hover:border-[#016836]'
                    }`}
                  >
                    Email Required Only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSettings({
                        fieldToggles: { ...settings.fieldToggles, phone: true, email: true },
                        requiredFields: { ...settings.requiredFields, phone: true, email: true },
                      });
                      showToast('Both Phone Number and Email set to Required', 'success');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                      settings.requiredFields.phone && settings.requiredFields.email
                        ? 'bg-[#016836] text-white border-[#016836]'
                        : 'bg-[#F7F4F2] text-[#26211E] border-[#E3DBD3] hover:border-[#016836]'
                    }`}
                  >
                    Both Required
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSettings({
                        requiredFields: { ...settings.requiredFields, phone: false, email: false },
                      });
                      showToast('Both Phone Number and Email set to Optional', 'info');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                      !settings.requiredFields.phone && !settings.requiredFields.email
                        ? 'bg-[#016836] text-white border-[#016836]'
                        : 'bg-[#F7F4F2] text-[#26211E] border-[#E3DBD3] hover:border-[#016836]'
                    }`}
                  >
                    Both Optional
                  </button>
                </div>

                {/* Separate Phone Row */}
                <div className="p-4 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#E3DBD3] flex items-center justify-center text-[#016836] shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#26211E]">Register Phone Number</p>
                      <p className="text-xs text-[#7B6E65]">
                        Dedicated mobile phone field on the Registration Portal
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!settings.fieldToggles.phone}
                      onClick={() => {
                        const next = !settings.requiredFields.phone;
                        updateRequiredField('phone', next);
                        showToast(`Phone Number is now ${next ? 'REQUIRED' : 'OPTIONAL'}`, 'info');
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition disabled:opacity-40 ${
                        settings.requiredFields.phone
                          ? 'bg-[#F2DEDE] text-[#E53C2E] border-[#E53C2E]/35'
                          : 'bg-white text-[#7B6E65] border-[#E3DBD3]'
                      }`}
                    >
                      {settings.requiredFields.phone ? 'Required *' : 'Optional'}
                    </button>
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7B6E65]">
                      <span>Show</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.fieldToggles.phone}
                        onClick={() => {
                          updateFieldToggle('phone', !settings.fieldToggles.phone);
                          showToast(
                            `Phone Number field ${!settings.fieldToggles.phone ? 'shown' : 'hidden'}`,
                            'info'
                          );
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          settings.fieldToggles.phone ? 'bg-[#016836]' : 'bg-[#B6ADA4]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            settings.fieldToggles.phone ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>

                {/* Separate Email Row */}
                <div className="p-4 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#E3DBD3] flex items-center justify-center text-[#0080BB] shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#26211E]">Register Email Address</p>
                      <p className="text-xs text-[#7B6E65]">
                        Dedicated email field on the Registration Portal
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!settings.fieldToggles.email}
                      onClick={() => {
                        const next = !settings.requiredFields.email;
                        updateRequiredField('email', next);
                        showToast(`Email Address is now ${next ? 'REQUIRED' : 'OPTIONAL'}`, 'info');
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition disabled:opacity-40 ${
                        settings.requiredFields.email
                          ? 'bg-[#F2DEDE] text-[#E53C2E] border-[#E53C2E]/35'
                          : 'bg-white text-[#7B6E65] border-[#E3DBD3]'
                      }`}
                    >
                      {settings.requiredFields.email ? 'Required *' : 'Optional'}
                    </button>
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7B6E65]">
                      <span>Show</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.fieldToggles.email}
                        onClick={() => {
                          updateFieldToggle('email', !settings.fieldToggles.email);
                          showToast(
                            `Email field ${!settings.fieldToggles.email ? 'shown' : 'hidden'}`,
                            'info'
                          );
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          settings.fieldToggles.email ? 'bg-[#016836]' : 'bg-[#B6ADA4]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            settings.fieldToggles.email ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>
              </div>

              {/* Other Invitation Page Field Toggles (Show/Hide + Required/Optional) */}
              <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="border-b border-[#E3DBD3] pb-3">
                  <h3 className="text-base font-bold text-[#26211E]">
                    All Invitation Page Field Controls (Visibility &amp; Required)
                  </h3>
                  <p className="text-xs text-[#7B6E65] mt-0.5">
                    Toggle any field ON/OFF and choose whether it is Required or Optional for <strong>{activeEvent.name}</strong>
                  </p>
                </div>

                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#016836]">
                    Core Registration Fields
                  </h4>
                  {currentFields.map((item) => {
                    const enabled = settings.fieldToggles[item.key];
                    const isRequired = settings.requiredFields[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#26211E]">{item.label}</p>
                          <p className="text-xs text-[#7B6E65] mt-0.5">{item.description}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            disabled={!enabled}
                            onClick={() => {
                              const next = !isRequired;
                              updateRequiredField(item.key, next);
                              showToast(
                                `${item.label} is now ${next ? 'REQUIRED' : 'OPTIONAL'}`,
                                'info'
                              );
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-bold border transition disabled:opacity-40 ${
                              isRequired
                                ? 'bg-[#F2DEDE] text-[#E53C2E] border-[#E53C2E]/35'
                                : 'bg-white text-[#7B6E65] border-[#E3DBD3]'
                            }`}
                          >
                            {isRequired ? 'Required *' : 'Optional'}
                          </button>
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7B6E65]">
                            <span>Show</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={enabled}
                              onClick={() => {
                                updateFieldToggle(item.key, !enabled);
                                showToast(
                                  `${item.label} ${!enabled ? 'enabled' : 'hidden'} on Invitation Page`,
                                  'info'
                                );
                              }}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                enabled ? 'bg-[#016836]' : 'bg-[#B6ADA4]'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                  enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2.5 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0080BB]">
                    School &amp; Extra Invitee Details
                  </h4>
                  {extraFields.map((item) => {
                    const enabled = settings.fieldToggles[item.key];
                    const isRequired = settings.requiredFields[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#26211E]">{item.label}</p>
                          <p className="text-xs text-[#7B6E65] mt-0.5">{item.description}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            disabled={!enabled}
                            onClick={() => {
                              const next = !isRequired;
                              updateRequiredField(item.key, next);
                              showToast(
                                `${item.label} is now ${next ? 'REQUIRED' : 'OPTIONAL'}`,
                                'info'
                              );
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-bold border transition disabled:opacity-40 ${
                              isRequired
                                ? 'bg-[#F2DEDE] text-[#E53C2E] border-[#E53C2E]/35'
                                : 'bg-white text-[#7B6E65] border-[#E3DBD3]'
                            }`}
                          >
                            {isRequired ? 'Required *' : 'Optional'}
                          </button>
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7B6E65]">
                            <span>Show</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={enabled}
                              onClick={() => {
                                updateFieldToggle(item.key, !enabled);
                                showToast(
                                  `${item.label} ${!enabled ? 'enabled' : 'hidden'} on Invitation Page`,
                                  'info'
                                );
                              }}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                enabled ? 'bg-[#016836]' : 'bg-[#B6ADA4]'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                  enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: QR Delivery Mode & Gate Rules */}
            <div className="lg:col-span-5 space-y-5">
              <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="border-b border-[#E3DBD3] pb-3.5">
                  <h3 className="text-base font-bold text-[#26211E] flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-[#016836]" />
                    <span>QR Code Delivery Mode</span>
                  </h3>
                  <p className="text-xs text-[#7B6E65] mt-0.5">
                    Choose how invitees receive their SABIS®-branded QR passes (quantity always matches Number of Attendees)
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      updateSettings({ qrDeliveryMode: 'on_screen' });
                      showToast('Mode set: Generate QR codes immediately upon registration', 'success');
                    }}
                    className={`w-full p-4 rounded-xl border text-left transition ${
                      settings.qrDeliveryMode === 'on_screen'
                        ? 'bg-[#EDF6F1] border-[#016836] shadow-sm'
                        : 'bg-[#F7F4F2] border-[#E3DBD3] hover:border-[#016836]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#26211E] flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-[#016836]" />
                        Generate QR Code Upon Registration
                      </span>
                      {settings.qrDeliveryMode === 'on_screen' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#016836] text-white flex items-center gap-1">
                          <Check className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#7B6E65] mt-1.5">
                      Invitees immediately see, download (PNG), and print all N SABIS®-branded QR passes right after submitting.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateSettings({ qrDeliveryMode: 'contact_info' });
                      showToast('Mode set: Send QR codes to registered contact information', 'success');
                    }}
                    className={`w-full p-4 rounded-xl border text-left transition ${
                      settings.qrDeliveryMode === 'contact_info'
                        ? 'bg-[#E6F4FA] border-[#0080BB] shadow-sm'
                        : 'bg-[#F7F4F2] border-[#E3DBD3] hover:border-[#0080BB]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#26211E] flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#0080BB]" />
                        Send QR to Registered Contact Info
                      </span>
                      {settings.qrDeliveryMode === 'contact_info' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0080BB] text-white flex items-center gap-1">
                          <Check className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#7B6E65] mt-1.5">
                      Hides on-screen QR codes and dispatches all N individual QR passes to the invitee&apos;s registered email/phone.
                    </p>
                  </button>
                </div>

                {settings.qrDeliveryMode === 'contact_info' && (
                  <div className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-[#26211E] mb-1">
                        Delivery Channel Preference
                      </label>
                      <select
                        value={settings.contactDeliveryChannel}
                        onChange={(e) =>
                          updateSettings({
                            contactDeliveryChannel: e.target.value as 'email' | 'phone' | 'both',
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E]"
                      >
                        <option value="email">Registered Email (Automated via Gmail SMTP)</option>
                        <option value="both">Email &amp; Phone (Registered Contact Info)</option>
                        <option value="phone">Registered Phone Only</option>
                      </select>
                    </div>

                    {emailStatus.checked && (
                      <div
                        className={`p-3 rounded-lg border text-xs space-y-2 ${
                          emailStatus.configured
                            ? 'bg-[#DFF0D8] border-[#016836]/30 text-[#016836]'
                            : 'bg-[#FCF8E3] border-[#8A6D3B]/35 text-[#8A6D3B]'
                        }`}
                      >
                        <p className="font-bold">
                          {emailStatus.configured
                            ? `✓ Live Email Delivery Active (${emailStatus.senderEmail})`
                            : '⚠️ Email Sender Not Yet Connected'}
                        </p>
                        {!emailStatus.configured && (
                          <p className="text-[11px] leading-relaxed">
                            Add <code className="font-mono font-bold">GMAIL_USER=hsdaou@gmail.com</code> and{' '}
                            <code className="font-mono font-bold">GMAIL_APP_PASSWORD</code> in Vercel Settings &rarr; Environment Variables, then Redeploy.
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={sendingTestEmail}
                          onClick={handleSendTestEmail}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#016836] hover:bg-[#01522B] text-white transition disabled:opacity-50"
                        >
                          {sendingTestEmail ? 'Sending Test...' : 'Send Test Email Now'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-[#26211E] flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-[#016836]" />
                  <span>Gate Verification Rules</span>
                </h3>
                <div className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-[#26211E]">Enforce Assigned Venue at Gate</p>
                    <p className="text-[11px] text-[#7B6E65] mt-0.5">
                      Reject passes scanned at a different venue than the one they registered for
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.strictGateMode}
                    onClick={() => updateSettings({ strictGateMode: !settings.strictGateMode })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.strictGateMode ? 'bg-[#016836]' : 'bg-[#B6ADA4]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                        settings.strictGateMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: VENUES, LINK GENERATION & CSV UPLOADS (CONTROL ONLY) ==================== */}
        {activeTab === 'venues' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4 border-t-4 border-t-[#016836]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3DBD3] pb-3.5">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#DFF0D8] text-[#016836] border border-[#016836]/25">
                    Control Dashboard Exclusive
                  </span>
                  <h3 className="text-base font-bold text-[#26211E] mt-1">
                    Event Name &amp; Venue Settings (With Maximum Capacity)
                  </h3>
                  <p className="text-xs text-[#7B6E65]">
                    Venue settings and max capacity are managed strictly here and never displayed on the School Dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveVenueSettings}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white flex items-center gap-1.5 shadow-sm transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Event &amp; Venues</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#26211E] mb-1.5">Assigned Event Name</label>
                  <input
                    type="text"
                    value={eventTitleDraft}
                    onChange={(e) => setEventTitleDraft(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#26211E] mb-1.5">Event Date (Optional)</label>
                  <input
                    type="date"
                    value={eventDateDraft}
                    onChange={(e) => setEventDateDraft(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-[#26211E]">
                  Configured Venues ({venueDrafts.length})
                </label>
                {venueDrafts.map((v, idx) => (
                  <div
                    key={v.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-[#F7F4F2] p-3 rounded-xl border border-[#E3DBD3]"
                  >
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => {
                        const copy = [...venueDrafts];
                        copy[idx] = { ...copy[idx], name: e.target.value, slug: slugifyVenue(e.target.value) };
                        setVenueDrafts(copy);
                      }}
                      className="sm:col-span-7 px-3 py-2 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E]"
                      placeholder="Venue Name"
                    />
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#7B6E65] shrink-0">Max Cap:</span>
                      <input
                        type="number"
                        min={10}
                        value={v.capacity}
                        onChange={(e) => {
                          const copy = [...venueDrafts];
                          copy[idx] = { ...copy[idx], capacity: Math.max(10, parseInt(e.target.value, 10) || 100) };
                          setVenueDrafts(copy);
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E] font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        disabled={venueDrafts.length <= 1}
                        onClick={() => setVenueDrafts((prev) => prev.filter((_, i) => i !== idx))}
                        className="px-2.5 py-2 rounded-lg text-xs text-[#E53C2E] hover:bg-[#F2DEDE] disabled:opacity-30 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-white p-3 rounded-xl border border-dashed border-[#B6ADA4]">
                  <input
                    type="text"
                    value={newVenueName}
                    onChange={(e) => setNewVenueName(e.target.value)}
                    placeholder="New Venue Name (e.g., Gate E - Performing Arts Center)"
                    className="sm:col-span-7 px-3 py-2 rounded-lg bg-[#F7F4F2] border border-[#E3DBD3] text-xs text-[#26211E]"
                  />
                  <input
                    type="number"
                    min={10}
                    value={newVenueCapacity}
                    onChange={(e) => setNewVenueCapacity(parseInt(e.target.value, 10) || 100)}
                    placeholder="Capacity"
                    className="sm:col-span-3 px-3 py-2 rounded-lg bg-[#F7F4F2] border border-[#E3DBD3] text-xs text-[#26211E] font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddVenueRow}
                    className="sm:col-span-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white flex items-center justify-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* Event-Scoped Link Generation & CSV Uploads */}
            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3DBD3] pb-3.5">
                <div>
                  <h3 className="text-base font-bold text-[#26211E]">
                    Link Generation (VIP &amp; Parent) + Per-Venue CSV Uploads — {activeEvent.name}
                  </h3>
                  <p className="text-xs text-[#7B6E65] mt-0.5">
                    Each link is locked to this event, venue, and invitation tier (exclusive to Control Dashboard).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#F7F4F2] hover:bg-[#E3DBD3]/60 text-[#016836] border border-[#E3DBD3] flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sample CSV Template</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {venues.map((v) => {
                  const parentUrl = getInvitationUrl(v, 'parent');
                  const vipUrl = getInvitationUrl(v, 'vip');
                  const venueRegs = registrations.filter((r) => r.assignedGate === v.name);
                  const vipCount = venueRegs.filter((r) => r.category === 'VIP').length;
                  const parentCount = venueRegs.length - vipCount;
                  const totalPasses = venueRegs.reduce((s, r) => s + r.passes.length, 0);

                  return (
                    <div
                      key={v.id}
                      className="p-4 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] space-y-3"
                    >
                      <div className="border-b border-[#E3DBD3] pb-2.5">
                        <h4 className="text-sm font-bold text-[#26211E]">{v.name}</h4>
                        <p className="text-[11px] text-[#7B6E65] mt-0.5">
                          <span className="text-[#8A6D3B] font-bold">{vipCount} VIP</span> •{' '}
                          <span className="text-[#016836] font-bold">{parentCount} Parent</span> •{' '}
                          {totalPasses} passes issued{' '}
                          <span className="text-[#7B6E65]">(Max Cap: {v.capacity})</span>
                        </p>
                      </div>

                      {/* Parent Link */}
                      <div className="p-3 rounded-lg bg-white border border-[#016836]/25 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#016836] uppercase tracking-wider">
                            Parent Link &amp; CSV
                          </span>
                          <a
                            href={parentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-[#016836] hover:underline flex items-center gap-1"
                          >
                            Preview <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="bg-[#F7F4F2] border border-[#E3DBD3] rounded px-2.5 py-1.5 text-[11px] font-mono text-[#0080BB] truncate">
                          {parentUrl}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyText(parentUrl, `Copied Parent link for ${v.name}`)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#016836] hover:bg-[#01522B] text-white flex items-center gap-1 transition"
                          >
                            <Copy className="w-3 h-3" /> Copy Link
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                `Dear Parent, please register for "${activeEvent.name}" (${v.name}) at: ${parentUrl}`,
                                `Copied Parent WhatsApp invite for ${v.name}`
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#DFF0D8] hover:bg-[#016836] hover:text-white text-[#016836] border border-[#016836]/25 transition"
                          >
                            WhatsApp Invite
                          </button>
                          <label className="cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F7F4F2] hover:bg-[#E3DBD3]/70 text-[#26211E] border border-[#E3DBD3] transition inline-flex items-center gap-1 ml-auto">
                            <Upload className="w-3 h-3 text-[#016836]" /> Parent CSV
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              onChange={(e) => handleVenueCsvUpload(e, v, 'Parent')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {/* VIP Link */}
                      <div className="p-3 rounded-lg bg-[#FCF8E3]/60 border border-[#8A6D3B]/35 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#8A6D3B] uppercase tracking-wider">
                            VIP Invitation Link &amp; CSV
                          </span>
                          <a
                            href={vipUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-[#8A6D3B] hover:underline flex items-center gap-1"
                          >
                            Preview VIP <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="bg-white border border-[#E3DBD3] rounded px-2.5 py-1.5 text-[11px] font-mono text-[#8A6D3B] truncate">
                          {vipUrl}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyText(vipUrl, `Copied VIP link for ${v.name}`)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#8A6D3B] hover:bg-[#70572E] text-white flex items-center gap-1 transition"
                          >
                            <Copy className="w-3 h-3" /> Copy VIP Link
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                `VIP Invitation — Please register for "${activeEvent.name}" (${v.name}) at: ${vipUrl}`,
                                `Copied VIP WhatsApp invite for ${v.name}`
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-[#8A6D3B] hover:text-white text-[#8A6D3B] border border-[#8A6D3B]/35 transition"
                          >
                            VIP WhatsApp
                          </button>
                          <label className="cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-[#E3DBD3]/60 text-[#26211E] border border-[#E3DBD3] transition inline-flex items-center gap-1 ml-auto">
                            <Upload className="w-3 h-3 text-[#8A6D3B]" /> VIP CSV
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              onChange={(e) => handleVenueCsvUpload(e, v, 'VIP')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: USER ACCESS MANAGEMENT (2 TIERS BY EMAIL) ==================== */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="border-b border-[#E3DBD3] pb-3.5">
                <h3 className="text-base font-bold text-[#26211E] flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#016836]" />
                  <span>Add Authorized User via Email</span>
                </h3>
                <p className="text-xs text-[#7B6E65] mt-0.5">
                  Register users into Tier 1 (School Dashboard) or Tier 2 (Gate Control Mobile Scanner)
                </p>
              </div>

              {userError && (
                <div className="p-3 rounded-xl bg-[#F2DEDE] border border-[#E53C2E]/35 text-xs text-[#A94442]">
                  {userError}
                </div>
              )}

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                    Registered Email Address <span className="text-[#E53C2E]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="coordinator@sabis.net"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="e.g., Sarah Mansour"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                    Access Tier / Role <span className="text-[#E53C2E]">*</span>
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setNewUserRole('regular')}
                      className={`w-full p-3 rounded-xl border text-left transition ${
                        newUserRole === 'regular'
                          ? 'bg-[#E6F4FA] border-[#0080BB] text-[#26211E]'
                          : 'bg-[#F7F4F2] border-[#E3DBD3] text-[#7B6E65]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-[#26211E]">
                        <Users className="w-4 h-4 text-[#0080BB]" />
                        <span>Tier 1: School Dashboard User</span>
                      </div>
                      <p className="text-[11px] text-[#7B6E65] mt-1">
                        View-only school dashboard + Staff Desk Manual Registration &amp; Pass Lookup + Event Logs
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewUserRole('gate')}
                      className={`w-full p-3 rounded-xl border text-left transition ${
                        newUserRole === 'gate'
                          ? 'bg-[#FCF8E3] border-[#8A6D3B] text-[#26211E]'
                          : 'bg-[#F7F4F2] border-[#E3DBD3] text-[#7B6E65]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-[#26211E]">
                        <Smartphone className="w-4 h-4 text-[#8A6D3B]" />
                        <span>Tier 2: Gate Control (Mobile QR Scanner)</span>
                      </div>
                      <p className="text-[11px] text-[#7B6E65] mt-1">
                        Uses mobile camera to scan attendee QR passes at entrances + Event Logs
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewUserRole('control')}
                      className={`w-full p-3 rounded-xl border text-left transition ${
                        newUserRole === 'control'
                          ? 'bg-[#EDF6F1] border-[#016836] text-[#26211E]'
                          : 'bg-[#F7F4F2] border-[#E3DBD3] text-[#7B6E65]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-[#26211E]">
                        <Shield className="w-4 h-4 text-[#016836]" />
                        <span>Control Dashboard Admin</span>
                      </div>
                      <p className="text-[11px] text-[#7B6E65] mt-1">
                        Create events, configure field/contact controls, links, user access &amp; view switcher
                      </p>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#016836] hover:bg-[#01522B] text-white shadow-sm transition"
                >
                  Authorize Email Access
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3DBD3] pb-3.5">
                <div>
                  <h3 className="text-base font-bold text-[#26211E]">Authorized Email Directory</h3>
                  <p className="text-xs text-[#7B6E65] mt-0.5">
                    {tierCounts.regular} School Dashboard • {tierCounts.gate} Gate Control •{' '}
                    {tierCounts.control} Control Admin
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(`${window.location.origin}/login`, 'Copied Staff Login URL')}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F7F4F2] hover:bg-[#E3DBD3]/60 text-[#016836] border border-[#E3DBD3] flex items-center gap-1.5 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Login Link</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {authorizedUsers.map((u) => {
                  const isSelf = session?.email.toLowerCase() === u.email.toLowerCase();
                  return (
                    <div
                      key={u.id}
                      className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-[#26211E]">{u.fullName || u.email}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              u.role === 'control'
                                ? 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                                : u.role === 'regular'
                                ? 'bg-[#E6F4FA] text-[#0080BB] border-[#0080BB]/25'
                                : 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/30'
                            }`}
                          >
                            {u.role === 'control'
                              ? 'Control Admin'
                              : u.role === 'regular'
                              ? 'Tier 1: School Dashboard'
                              : 'Tier 2: Gate Control'}
                          </span>
                          {!u.active && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F2DEDE] text-[#E53C2E]">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-[#7B6E65] mt-0.5">{u.email}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) =>
                            updateAuthorizedUser(u.id, { role: e.target.value as UserRole })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E] disabled:opacity-50"
                        >
                          <option value="regular">Tier 1: School Dashboard</option>
                          <option value="gate">Tier 2: Gate Control</option>
                          <option value="control">Control Admin</option>
                        </select>

                        {!isSelf && (
                          <>
                            <button
                              type="button"
                              onClick={() => updateAuthorizedUser(u.id, { active: !u.active })}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-[#E3DBD3]/60 text-[#26211E] border border-[#E3DBD3]"
                            >
                              {u.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                removeAuthorizedUser(u.id);
                                showToast(`Removed ${u.email}`, 'info');
                              }}
                              className="p-1.5 rounded-lg text-[#E53C2E] hover:bg-[#F2DEDE] transition"
                              title="Revoke User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: LIVE ATTENDANCE & DATA MANAGEMENT ==================== */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <KpiStrip
              registrations={registrations}
              scanLogs={scanLogs}
              onInspectPasses={setInspectingReg}
            />
            <LiveAttendanceView
              venues={venues}
              registrations={registrations}
              readOnly={false}
              onInspectPasses={setInspectingReg}
              onDeleteRegistration={(id) => {
                deleteRegistration(id);
                showToast(`Removed registration ${id}`, 'info');
              }}
              onResetDemo={() => {
                resetDemoData();
                showToast('Restored default demo roster & settings', 'info');
              }}
            />
          </div>
        )}

        {/* ==================== TAB 5: EVENT SCAN LOGS ==================== */}
        {activeTab === 'logs' && (
          <EventLogsPanel
            logs={scanLogs}
            canClear={true}
            onClear={() => {
              clearScanLogs();
              showToast('Cleared event scan logs', 'info');
            }}
          />
        )}
      </main>

      {/* ==================== MODAL: CREATE NEW EVENT ==================== */}
      {showCreateEventModal && (
        <div className="fixed inset-0 z-50 bg-[#26211E]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-[#E3DBD3] border-t-4 border-t-[#016836] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3DBD3] pb-3">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-[#016836]" />
                <h3 className="text-base font-bold text-[#26211E]">Create New Event</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateEventModal(false)}
                className="p-1 rounded-lg text-[#7B6E65] hover:bg-[#F7F4F2]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEventSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                  Event Name <span className="text-[#E53C2E]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder="e.g., SABIS® Science Fair 2026 — Abu Dhabi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                  Event Date (Optional)
                </label>
                <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
                />
              </div>

              <p className="text-[11px] text-[#7B6E65]">
                Each event gets its own dedicated venues, invitation links, field controls, QR passes, live attendance, and scan logs.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateEventModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#F7F4F2] text-[#7B6E65] hover:bg-[#E3DBD3]/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white shadow-sm"
                >
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PassInspectorModal registration={inspectingReg} onClose={() => setInspectingReg(null)} />
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Mail,
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

const FIELD_TOGGLE_ITEMS: FieldToggleDescriptor[] = [
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
    key: 'phone',
    label: 'Register Phone Number',
    description: 'Primary contact mobile phone number',
    group: 'current',
  },
  {
    key: 'numAttendees',
    label: 'Number of Attendees',
    description: 'Controls how many individual QR codes are generated/sent (1 per attendee)',
    group: 'current',
  },
  {
    key: 'school',
    label: 'Which school are your kids attending?',
    description: 'Shows SABIS® / ISC (12 UAE branches dropdown) or Other School selector',
    group: 'extra',
  },
  {
    key: 'email',
    label: 'Register Email',
    description: 'Primary email address (also used when sending QR codes to contact info)',
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
    settings,
    venues,
    authorizedUsers,
    registrations,
    scanLogs,
    session,
    updateSettings,
    updateFieldToggle,
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

  // Venue Settings Draft State
  const [eventTitleDraft, setEventTitleDraft] = useState(settings.eventTitle);
  const [venueDrafts, setVenueDrafts] = useState<Venue[]>(venues);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState(120);

  // User Access Form State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('regular');
  const [userError, setUserError] = useState('');

  // Keep drafts synced when switching to venues tab
  const openVenuesTab = () => {
    setEventTitleDraft(settings.eventTitle);
    setVenueDrafts(venues);
    setActiveTab('venues');
  };

  const getInvitationUrl = (venue: Venue, tier: 'regular' | 'vip') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/register?venue=${encodeURIComponent(venue.slug)}&tier=${tier}`;
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
      id: `GATE-${Date.now().toString().slice(-4)}`,
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
    await updateSettings({ eventTitle: eventTitleDraft.trim() || settings.eventTitle });
    await saveVenues(venueDrafts);
    showToast('Event title & venue settings saved!', 'success');
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
    tier: 'VIP' | 'Regular Parent'
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

  const tierCounts = useMemo(() => {
    return {
      regular: authorizedUsers.filter((u) => u.role === 'regular').length,
      gate: authorizedUsers.filter((u) => u.role === 'gate').length,
      control: authorizedUsers.filter((u) => u.role === 'control').length,
    };
  }, [authorizedUsers]);

  const currentFields = FIELD_TOGGLE_ITEMS.filter((f) => f.group === 'current');
  const extraFields = FIELD_TOGGLE_ITEMS.filter((f) => f.group === 'extra');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <TopBar />

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Control Dashboard Sub-Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
              Administrator Control Center
            </span>
            <h2 className="text-xl font-bold text-white">Control Dashboard</h2>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'form'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>1. Form &amp; QR Controls</span>
            </button>
            <button
              type="button"
              onClick={openVenuesTab}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'venues'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>5. Event Logs ({scanLogs.length})</span>
            </button>
          </nav>
        </div>

        {/* ==================== TAB 1: FORM FIELDS & QR DELIVERY CONTROLS ==================== */}
        {activeTab === 'form' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Field Appearance Toggles */}
            <div className="lg:col-span-7 space-y-5">
              <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Invitation Page Field Visibility Toggles
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Switch any field ON or OFF to immediately control what appears on the public invitation form
                    </p>
                  </div>
                  <a
                    href={`/register?venue=${encodeURIComponent(venues[0]?.slug || '')}&tier=regular`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Preview Invitation Page</span>
                  </a>
                </div>

                {/* Current Core Fields */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    Current Invitation Fields
                  </h4>
                  {currentFields.map((item) => {
                    const enabled = settings.fieldToggles[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-3.5 rounded-xl bg-slate-900/85 border border-slate-800 flex items-center justify-between gap-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{item.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                        </div>
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
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                            enabled ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                              enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* School & Extra Invitee Details */}
                <div className="space-y-2.5 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    School &amp; Extra Invitee Details
                  </h4>
                  {extraFields.map((item) => {
                    const enabled = settings.fieldToggles[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-3.5 rounded-xl bg-slate-900/85 border border-slate-800 flex items-center justify-between gap-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{item.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                        </div>
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
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                            enabled ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                              enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: QR Delivery Mode & Scanner Security */}
            <div className="lg:col-span-5 space-y-5">
              <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="border-b border-slate-800 pb-3.5">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-sky-400" />
                    <span>QR Code Delivery Mode</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Choose how invitees receive their QR passes (quantity always matches Number of Attendees)
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
                        ? 'bg-indigo-600/20 border-indigo-400 shadow-lg shadow-indigo-500/10'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-indigo-400" />
                        Generate QR Code Upon Registration
                      </span>
                      {settings.qrDeliveryMode === 'on_screen' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Invitees immediately see, download (PNG), and print all N generated QR passes right after submitting.
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
                        ? 'bg-sky-600/20 border-sky-400 shadow-lg shadow-sky-500/10'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white flex items-center gap-2">
                        <Mail className="w-4 h-4 text-sky-400" />
                        Send QR to Registered Contact Info
                      </span>
                      {settings.qrDeliveryMode === 'contact_info' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Hides on-screen QR codes and dispatches all N individual QR passes to the invitee&apos;s registered email/phone.
                    </p>
                  </button>
                </div>

                {settings.qrDeliveryMode === 'contact_info' && (
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      Delivery Channel Preference
                    </label>
                    <select
                      value={settings.contactDeliveryChannel}
                      onChange={(e) =>
                        updateSettings({
                          contactDeliveryChannel: e.target.value as 'email' | 'phone' | 'both',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      <option value="both">Email &amp; Phone (Registered Contact Info)</option>
                      <option value="email">Registered Email Only</option>
                      <option value="phone">Registered Phone Only</option>
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Live email delivery uses <code className="text-sky-300">RESEND_API_KEY</code> in Vercel environment variables.
                    </p>
                  </div>
                )}
              </div>

              {/* Gate Security Settings */}
              <div className="glass-panel rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-indigo-400" />
                  <span>Gate Verification Rules</span>
                </h3>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-white">Enforce Assigned Venue at Gate</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Reject passes scanned at a different venue than the one they registered for
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.strictGateMode}
                    onClick={() => updateSettings({ strictGateMode: !settings.strictGateMode })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.strictGateMode ? 'bg-indigo-500' : 'bg-slate-700'
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
            {/* Venue & Event Settings Card (Control Only) */}
            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4 border border-indigo-500/30">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Control Dashboard Exclusive
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">
                    Event Title &amp; Venue Settings (With Maximum Capacity)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Venue settings and max capacity are managed strictly here and never displayed on the Regular Dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveVenueSettings}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save All Settings</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Event Title</label>
                <input
                  type="text"
                  value={eventTitleDraft}
                  onChange={(e) => setEventTitleDraft(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Configured Venues ({venueDrafts.length})
                </label>
                {venueDrafts.map((v, idx) => (
                  <div
                    key={v.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-slate-900/80 p-3 rounded-xl border border-slate-800"
                  >
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => {
                        const copy = [...venueDrafts];
                        copy[idx] = { ...copy[idx], name: e.target.value, slug: slugifyVenue(e.target.value) };
                        setVenueDrafts(copy);
                      }}
                      className="sm:col-span-7 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                      placeholder="Venue Name"
                    />
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 shrink-0">Max Cap:</span>
                      <input
                        type="number"
                        min={10}
                        value={v.capacity}
                        onChange={(e) => {
                          const copy = [...venueDrafts];
                          copy[idx] = { ...copy[idx], capacity: Math.max(10, parseInt(e.target.value, 10) || 100) };
                          setVenueDrafts(copy);
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        disabled={venueDrafts.length <= 1}
                        onClick={() => setVenueDrafts((prev) => prev.filter((_, i) => i !== idx))}
                        className="px-2.5 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add new venue row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-slate-900/40 p-3 rounded-xl border border-dashed border-slate-700">
                  <input
                    type="text"
                    value={newVenueName}
                    onChange={(e) => setNewVenueName(e.target.value)}
                    placeholder="New Venue Name (e.g., Gate E - Performing Arts Center)"
                    className="sm:col-span-7 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                  />
                  <input
                    type="number"
                    min={10}
                    value={newVenueCapacity}
                    onChange={(e) => setNewVenueCapacity(parseInt(e.target.value, 10) || 100)}
                    placeholder="Capacity"
                    className="sm:col-span-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddVenueRow}
                    className="sm:col-span-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* Auto-Generated Locked Venue Links (VIP & Regular) + Per-Venue CSV Uploaders */}
            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Link Generation (VIP &amp; Regular) + Per-Venue CSV Uploads
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Removed from Regular Dashboard — exclusive to Control Dashboard Admins.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sample CSV Template</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {venues.map((v) => {
                  const regUrl = getInvitationUrl(v, 'regular');
                  const vipUrl = getInvitationUrl(v, 'vip');
                  const venueRegs = registrations.filter((r) => r.assignedGate === v.name);
                  const vipCount = venueRegs.filter((r) => r.category === 'VIP').length;
                  const regCount = venueRegs.length - vipCount;
                  const totalPasses = venueRegs.reduce((s, r) => s + r.passes.length, 0);

                  return (
                    <div
                      key={v.id}
                      className="p-4 rounded-xl bg-slate-900/85 border border-slate-700/80 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div>
                          <h4 className="text-sm font-bold text-white">{v.name}</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <span className="text-amber-300 font-semibold">{vipCount} VIP</span> •{' '}
                            <span className="text-sky-300 font-semibold">{regCount} Regular</span> •{' '}
                            {totalPasses} passes issued{' '}
                            <span className="text-slate-500">(Max Cap: {v.capacity})</span>
                          </p>
                        </div>
                      </div>

                      {/* Regular Link */}
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-indigo-500/25 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                            Regular Parents Link &amp; CSV
                          </span>
                          <a
                            href={regUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-indigo-300 hover:underline flex items-center gap-1"
                          >
                            Preview <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-sky-300 truncate">
                          {regUrl}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyText(regUrl, `Copied Regular link for ${v.name}`)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 transition"
                          >
                            <Copy className="w-3 h-3" /> Copy Link
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                `Dear Parent, please register for "${settings.eventTitle}" (${v.name}) at: ${regUrl}`,
                                `Copied Regular WhatsApp invite for ${v.name}`
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 transition"
                          >
                            WhatsApp Invite
                          </button>
                          <label className="cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition inline-flex items-center gap-1 ml-auto">
                            <Upload className="w-3 h-3" /> Regular CSV
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              onChange={(e) => handleVenueCsvUpload(e, v, 'Regular Parent')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {/* VIP Link */}
                      <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                            ⭐ VIP Invitation Link &amp; CSV
                          </span>
                          <a
                            href={vipUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-amber-300 hover:underline flex items-center gap-1"
                          >
                            Preview VIP <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-amber-200 truncate">
                          {vipUrl}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyText(vipUrl, `Copied VIP link for ${v.name}`)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1 transition"
                          >
                            <Copy className="w-3 h-3" /> Copy VIP Link
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                `VIP Invitation — Please register for "${settings.eventTitle}" (${v.name}) at: ${vipUrl}`,
                                `Copied VIP WhatsApp invite for ${v.name}`
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 transition"
                          >
                            VIP WhatsApp
                          </button>
                          <label className="cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition inline-flex items-center gap-1 ml-auto">
                            <Upload className="w-3 h-3" /> VIP CSV
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
            {/* Add User Form */}
            <div className="lg:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="border-b border-slate-800 pb-3.5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-indigo-400" />
                  <span>Add Authorized User via Email</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Register users into Tier 1 (Regular Dashboard) or Tier 2 (Gate Control Mobile Scanner)
                </p>
              </div>

              {userError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                  {userError}
                </div>
              )}

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Registered Email Address <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="coordinator@sabis.net"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="e.g., Sarah Mansour"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Access Tier / Role <span className="text-rose-400">*</span>
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setNewUserRole('regular')}
                      className={`w-full p-3 rounded-xl border text-left transition ${
                        newUserRole === 'regular'
                          ? 'bg-sky-500/15 border-sky-400 text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <Users className="w-4 h-4 text-sky-400" />
                        <span>Tier 1: Regular Dashboard User</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        View-only dashboard + Staff Desk Manual Registration &amp; Pass Lookup + Event Logs
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewUserRole('gate')}
                      className={`w-full p-3 rounded-xl border text-left transition ${
                        newUserRole === 'gate'
                          ? 'bg-emerald-500/15 border-emerald-400 text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <span>Tier 2: Gate Control (Mobile QR Scanner)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Uses mobile camera to scan attendee QR passes at entrances + Event Logs
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewUserRole('control')}
                      className={`w-full p-3 rounded-xl border text-left transition ${
                        newUserRole === 'control'
                          ? 'bg-indigo-500/15 border-indigo-400 text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <Shield className="w-4 h-4 text-indigo-400" />
                        <span>Control Dashboard Admin</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Full settings, field toggles, link generation, user management &amp; view switcher
                      </p>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
                >
                  Authorize Email Access
                </button>
              </form>
            </div>

            {/* Authorized Users List */}
            <div className="lg:col-span-7 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                <div>
                  <h3 className="text-base font-bold text-white">Authorized Email Directory</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {tierCounts.regular} Regular Dashboard • {tierCounts.gate} Gate Control •{' '}
                    {tierCounts.control} Control Admin
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(`${window.location.origin}/login`, 'Copied Staff Login URL')}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 flex items-center gap-1.5 transition"
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
                      className="p-3.5 rounded-xl bg-slate-900/85 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{u.fullName || u.email}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              u.role === 'control'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                : u.role === 'regular'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {u.role === 'control'
                              ? 'Control Admin'
                              : u.role === 'regular'
                              ? 'Tier 1: Regular Dashboard'
                              : 'Tier 2: Gate Control'}
                          </span>
                          {!u.active && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">{u.email}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) =>
                            updateAuthorizedUser(u.id, { role: e.target.value as UserRole })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white disabled:opacity-50"
                        >
                          <option value="regular">Tier 1: Regular</option>
                          <option value="gate">Tier 2: Gate Control</option>
                          <option value="control">Control Admin</option>
                        </select>

                        {!isSelf && (
                          <>
                            <button
                              type="button"
                              onClick={() => updateAuthorizedUser(u.id, { active: !u.active })}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                            >
                              {u.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                removeAuthorizedUser(u.id);
                                showToast(`Removed ${u.email}`, 'info');
                              }}
                              className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 transition"
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

      <PassInspectorModal registration={inspectingReg} onClose={() => setInspectingReg(null)} />
    </div>
  );
};

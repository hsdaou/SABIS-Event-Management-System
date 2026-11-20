import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Printer, QrCode, Search, UserPlus } from 'lucide-react';
import { useEvent } from '../context/EventContext';
import { buildPassQrPayload, downloadPassPng, formatTimeOnly, getSchoolDisplay } from '../lib/qr';
import type { OtherAttendeeDetail, Registration } from '../types';
import { QrCodeImage } from './QrCodeImage';
import { SchoolSelectorField } from './SchoolSelectorField';

interface StaffDeskRegistrationProps {
  onInspectAllPasses: (reg: Registration) => void;
}

export const StaffDeskRegistration: React.FC<StaffDeskRegistrationProps> = ({ onInspectAllPasses }) => {
  const { settings, venues, registrations, createRegistration, showToast } = useEvent();

  // Registration form state
  const [parentNumber, setParentNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [assignedGate, setAssignedGate] = useState(venues[0]?.name || 'Gate A - Main Campus Entrance');
  const [category, setCategory] = useState<'Regular Parent' | 'VIP'>('Regular Parent');
  const [schoolType, setSchoolType] = useState<'sabis_isc' | 'other' | ''>('');
  const [schoolBranch, setSchoolBranch] = useState('');
  const [schoolOther, setSchoolOther] = useState('');
  const [attendeeAges, setAttendeeAges] = useState<string[]>(['']);
  const [otherAttendees, setOtherAttendees] = useState<OtherAttendeeDetail[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pass Lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [selectedRegId, setSelectedRegId] = useState<string>(registrations[0]?.id || '');
  const [activePassIdx, setActivePassIdx] = useState(0);

  const handlePartySizeChange = (val: number) => {
    const clamped = Math.max(1, Math.min(20, val || 1));
    setPartySize(clamped);
    setAttendeeAges((prev) => Array.from({ length: clamped }, (_, i) => prev[i] || ''));
    setOtherAttendees((prev) =>
      Array.from({ length: Math.max(0, clamped - 1) }, (_, i) => prev[i] || { name: '', contact: '' })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Please enter the attendee or parent full name.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const { registration } = await createRegistration({
        parentNumber,
        name,
        phone,
        email,
        schoolType,
        schoolBranch,
        schoolOther,
        category,
        assignedGate: assignedGate || venues[0]?.name || '',
        partySize,
        attendeeAges,
        otherAttendees,
        notes,
        fromInvitationPage: false,
      });

      setSelectedRegId(registration.id);
      setActivePassIdx(0);
      setParentNumber('');
      setName('');
      setPhone('');
      setEmail('');
      setPartySize(1);
      setSchoolType('');
      setSchoolBranch('');
      setSchoolOther('');
      setAttendeeAges(['']);
      setOtherAttendees([]);
      setNotes('');
      showToast(
        `Registered ${registration.name} & generated ${registration.passes.length} QR pass(es)!`,
        'success'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const lookupMatches = useMemo(() => {
    const q = lookupQuery.trim().toLowerCase();
    if (!q) return [];
    return registrations
      .filter((r) => {
        const passMatch = r.passes.some((p) => p.passCode.toLowerCase().includes(q));
        return (
          passMatch ||
          `${r.parentNumber} ${r.id} ${r.name} ${r.phone} ${r.email}`.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [lookupQuery, registrations]);

  const selectedReg = useMemo(
    () => registrations.find((r) => r.id === selectedRegId) || registrations[0] || null,
    [registrations, selectedRegId]
  );

  const safePassIdx = selectedReg ? Math.min(activePassIdx, Math.max(0, selectedReg.passes.length - 1)) : 0;
  const activePass = selectedReg?.passes[safePassIdx] || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Staff Desk Manual Registration */}
      <div className="lg:col-span-7 glass-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              <span>Staff Desk Manual Registration &amp; Pass Lookup</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Register a walk-in parent/VIP on-site (generates 1 QR code per attendee) or look up existing passes
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-indigo-300 mb-1">Parent Number</label>
              <input
                type="text"
                value={parentNumber}
                onChange={(e) => setParentNumber(e.target.value)}
                placeholder="e.g., PAR-1042"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-indigo-300 mb-1">
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Nadia Khoury"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 50 482 1900"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-indigo-300 mb-1">
                Number of Attendees <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={20}
                required
                value={partySize}
                onChange={(e) => handlePartySizeChange(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-indigo-500/40 text-sm text-white focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Venue</label>
              <select
                value={assignedGate}
                onChange={(e) => setAssignedGate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Invitation Tier</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'Regular Parent' | 'VIP')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Regular Parent">Regular Parent</option>
                <option value="VIP">⭐ VIP</option>
              </select>
            </div>
          </div>

          <SchoolSelectorField
            schoolType={schoolType}
            schoolBranch={schoolBranch}
            schoolOther={schoolOther}
            onChangeType={setSchoolType}
            onChangeBranch={setSchoolBranch}
            onChangeOther={setSchoolOther}
          />

          {/* Dynamic Ages & Additional Attendee Contacts */}
          <details className="bg-slate-900/50 rounded-xl border border-slate-800 px-3.5 py-2.5">
            <summary className="text-xs font-medium text-slate-300 cursor-pointer select-none">
              Attendee Ages, Other Attendee Contact Details &amp; Notes (Optional)
            </summary>
            <div className="pt-3 space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 mb-1.5">
                  Age of Attendees ({partySize})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Array.from({ length: partySize }).map((_, idx) => (
                    <input
                      key={idx}
                      type="number"
                      min={1}
                      max={110}
                      placeholder={`Attendee ${idx + 1} age`}
                      value={attendeeAges[idx] || ''}
                      onChange={(e) => {
                        const copy = [...attendeeAges];
                        copy[idx] = e.target.value;
                        setAttendeeAges(copy);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  ))}
                </div>
              </div>

              {partySize > 1 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-400">
                    Contact Details of Other Attendee(s)
                  </p>
                  {otherAttendees.map((other, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder={`Attendee ${idx + 2} Name`}
                        value={other.name}
                        onChange={(e) => {
                          const copy = [...otherAttendees];
                          copy[idx] = { ...copy[idx], name: e.target.value };
                          setOtherAttendees(copy);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder={`Attendee ${idx + 2} Phone / Email`}
                        value={other.contact}
                        onChange={(e) => {
                          const copy = [...otherAttendees];
                          copy[idx] = { ...copy[idx], contact: e.target.value };
                          setOtherAttendees(copy);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional desk note"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>
          </details>

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white shadow-lg shadow-indigo-600/25 transition flex items-center gap-2 disabled:opacity-50"
            >
              <QrCode className="w-4 h-4" />
              <span>
                Register &amp; Generate {partySize} QR {partySize === 1 ? 'Pass' : 'Passes'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Right: Pass Lookup & Multi-QR Inspector */}
      <div className="lg:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Pass Lookup &amp; QR Inspector</h2>
            {selectedReg && (
              <span className="text-xs font-semibold text-sky-300 bg-sky-500/15 px-2.5 py-0.5 rounded-full border border-sky-500/30">
                {selectedReg.passes.length} QR {selectedReg.passes.length === 1 ? 'Pass' : 'Passes'}
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="Lookup by Parent #, Name, Phone, Email, or Pass ID..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {lookupMatches.length > 0 && (
            <div className="rounded-xl bg-slate-950 border border-slate-700 divide-y divide-slate-800 max-h-44 overflow-y-auto">
              {lookupMatches.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRegId(r.id);
                    setActivePassIdx(0);
                    setLookupQuery('');
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-800/80 flex items-center justify-between gap-2 transition"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{r.name}</p>
                    <p className="text-[11px] font-mono text-slate-400 truncate">
                      {r.parentNumber || r.id} • {r.assignedGate}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-300 shrink-0">
                    {r.passes.length} QR
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedReg && activePass ? (
          <>
            <div
              className={`${
                selectedReg.category === 'VIP'
                  ? 'vip-pass-gradient border-amber-500/40'
                  : 'pass-gradient border-indigo-500/30'
              } rounded-2xl p-5 border shadow-xl printable-pass-area`}
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 pb-3 mb-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-indigo-400 font-semibold">
                    Pass {activePass.passIndex} of {activePass.totalPasses}
                  </p>
                  <h3 className="text-base font-bold text-white truncate mt-0.5">
                    {activePass.attendeeLabel || selectedReg.name}
                  </h3>
                  <p className="text-xs font-mono text-sky-300 mt-0.5">
                    Parent #: {selectedReg.parentNumber || selectedReg.id}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${
                    selectedReg.category === 'VIP'
                      ? 'bg-amber-500/25 text-amber-300 border-amber-400/40'
                      : 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30'
                  }`}
                >
                  {selectedReg.category === 'VIP' ? '⭐ VIP' : 'Regular'}
                </span>
              </div>

              <div className="flex flex-col items-center my-3">
                <div className="bg-white p-3 rounded-2xl shadow-lg border-4 border-indigo-500/20">
                  <QrCodeImage payload={buildPassQrPayload(selectedReg, activePass)} size={184} />
                </div>
                <p className="mt-2.5 font-mono text-xs font-bold tracking-widest text-sky-300 bg-slate-900/90 px-3 py-1 rounded-md border border-slate-700">
                  {activePass.passCode}
                </p>
              </div>

              {/* Pass Stepper for Multi-Attendee Registrations */}
              {selectedReg.passes.length > 1 && (
                <div className="flex items-center justify-between gap-2 mb-3 bg-slate-900/80 rounded-xl p-2 border border-slate-800 print:hidden">
                  <button
                    type="button"
                    disabled={safePassIdx === 0}
                    onClick={() => setActivePassIdx((i) => Math.max(0, i - 1))}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-200">
                    Viewing Pass {safePassIdx + 1} of {selectedReg.passes.length}
                  </span>
                  <button
                    type="button"
                    disabled={safePassIdx >= selectedReg.passes.length - 1}
                    onClick={() => setActivePassIdx((i) => Math.min(selectedReg.passes.length - 1, i + 1))}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-900/65 rounded-xl p-3 border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Assigned Venue</span>
                  <span className="font-semibold text-white block truncate">{selectedReg.assignedGate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Pass Status</span>
                  <span
                    className={`font-semibold ${
                      activePass.status === 'USED' ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {activePass.status === 'USED'
                      ? `Used (${formatTimeOnly(activePass.usedAt)})`
                      : 'Valid / Pending'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[11px]">School</span>
                  <span className="font-medium text-slate-200 block truncate">
                    {getSchoolDisplay(selectedReg)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => downloadPassPng(selectedReg, activePass, settings.eventTitle)}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save PNG</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => onInspectAllPasses(selectedReg)}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 flex items-center justify-center gap-1 transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>All ({selectedReg.passes.length})</span>
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500 py-8 text-center">No registrations available yet.</p>
        )}
      </div>
    </div>
  );
};

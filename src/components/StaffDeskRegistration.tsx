import React, { useEffect, useMemo, useState } from 'react';
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

  const [parentNumber, setParentNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySizeInput, setPartySizeInput] = useState('1');
  const [assignedGate, setAssignedGate] = useState(venues[0]?.name || 'Gate A - Main Campus Entrance');
  const [category, setCategory] = useState<'Parent' | 'VIP'>('Parent');
  const [schoolType, setSchoolType] = useState<'sabis_isc' | 'other' | ''>('');
  const [schoolBranch, setSchoolBranch] = useState('');
  const [schoolOther, setSchoolOther] = useState('');
  const [attendeeAges, setAttendeeAges] = useState<string[]>(['']);
  const [otherAttendees, setOtherAttendees] = useState<OtherAttendeeDetail[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [lookupQuery, setLookupQuery] = useState('');
  const [selectedRegId, setSelectedRegId] = useState<string>(registrations[0]?.id || '');
  const [activePassIdx, setActivePassIdx] = useState(0);

  useEffect(() => {
    if (venues.length > 0 && !venues.some((v) => v.name === assignedGate)) {
      setAssignedGate(venues[0].name);
    }
  }, [assignedGate, venues]);

  const parsedPartySize = parseInt(partySizeInput, 10);
  const partySize = Number.isFinite(parsedPartySize) && parsedPartySize >= 1 ? Math.min(20, parsedPartySize) : 1;

  const handlePartySizeInputChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 2);
    if (digitsOnly === '') {
      setPartySizeInput('');
      return;
    }
    const parsed = parseInt(digitsOnly, 10);
    const clamped = Math.min(20, Math.max(1, parsed || 1));
    setPartySizeInput(parsed > 20 ? '20' : digitsOnly);
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

      if (!registration) return;

      setSelectedRegId(registration.id);
      setActivePassIdx(0);
      setParentNumber('');
      setName('');
      setPhone('');
      setEmail('');
      setPartySizeInput('1');
      setSchoolType('');
      setSchoolBranch('');
      setSchoolOther('');
      setAttendeeAges(['']);
      setOtherAttendees([]);
      setNotes('');
      showToast(
        `Registered ${registration.name} & generated ${registration.passes.length} SABIS® QR pass(es)!`,
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
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-[#E3DBD3]">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#26211E] flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#016836]" />
              <span>Staff Desk Manual Registration &amp; Pass Lookup</span>
            </h2>
            <p className="text-xs text-[#7B6E65] mt-0.5">
              Register a walk-in parent/VIP on-site (generates 1 SABIS® QR code per attendee) or look up existing passes
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-[#016836] mb-1">Parent Number</label>
              <input
                type="text"
                value={parentNumber}
                onChange={(e) => setParentNumber(e.target.value)}
                placeholder="e.g., PAR-1042"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm font-mono text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#016836] mb-1">
                Full Name <span className="text-[#E53C2E]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Nadia Khoury"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-[#26211E] mb-1">
                Phone Number {settings.requiredFields.phone && <span className="text-[#E53C2E]">*</span>}
              </label>
              <input
                type="tel"
                required={settings.requiredFields.phone}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 50 482 1900"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#26211E] mb-1">
                Email Address {settings.requiredFields.email && <span className="text-[#E53C2E]">*</span>}
              </label>
              <input
                type="email"
                required={settings.requiredFields.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#016836] mb-1">
                Number of Attendees <span className="text-[#E53C2E]">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                required
                value={partySizeInput}
                onChange={(e) => handlePartySizeInputChange(e.target.value)}
                placeholder="1–20"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#016836]/40 text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#7B6E65] mb-1">Assigned Venue</label>
              <select
                value={assignedGate}
                onChange={(e) => setAssignedGate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#7B6E65] mb-1">Invitation Tier</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'Parent' | 'VIP')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
              >
                <option value="Parent">Parent</option>
                <option value="VIP">VIP</option>
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

          <details className="bg-[#F7F4F2] rounded-xl border border-[#E3DBD3] px-3.5 py-2.5">
            <summary className="text-xs font-semibold text-[#26211E] cursor-pointer select-none">
              Attendee Ages, Other Attendee Contact Details &amp; Notes (Optional)
            </summary>
            <div className="pt-3 space-y-3">
              <div>
                <p className="text-[11px] font-bold text-[#7B6E65] mb-1.5">
                  Age of Attendees ({partySize})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Array.from({ length: partySize }).map((_, idx) => (
                    <input
                      key={idx}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={`Attendee ${idx + 1} age`}
                      value={attendeeAges[idx] || ''}
                      onChange={(e) => {
                        const copy = [...attendeeAges];
                        copy[idx] = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setAttendeeAges(copy);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E]"
                    />
                  ))}
                </div>
              </div>

              {partySize > 1 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-[#7B6E65]">
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
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E]"
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
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E]"
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
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E]"
              />
            </div>
          </details>

          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#016836] hover:bg-[#01522B] text-white shadow-md shadow-[#016836]/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              <QrCode className="w-4 h-4" />
              <span>
                Register &amp; Generate {partySize} SABIS® QR {partySize === 1 ? 'Pass' : 'Passes'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Right: Pass Lookup & Multi-QR Inspector */}
      <div className="lg:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#26211E]">Pass Lookup &amp; QR Inspector</h2>
            {selectedReg && (
              <span className="text-xs font-bold text-[#016836] bg-[#DFF0D8] px-2.5 py-0.5 rounded-full border border-[#016836]/25">
                {selectedReg.passes.length} QR {selectedReg.passes.length === 1 ? 'Pass' : 'Passes'}
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#7B6E65] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="Lookup by Parent #, Name, Phone, Email, or Pass ID..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#B6ADA4] text-xs text-[#26211E] placeholder-[#7B6E65] focus:outline-none focus:border-[#016836]"
            />
          </div>

          {lookupMatches.length > 0 && (
            <div className="rounded-xl bg-white border border-[#E3DBD3] shadow-md divide-y divide-[#E3DBD3] max-h-44 overflow-y-auto">
              {lookupMatches.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRegId(r.id);
                    setActivePassIdx(0);
                    setLookupQuery('');
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#F7F4F2] flex items-center justify-between gap-2 transition"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#26211E] truncate">{r.name}</p>
                    <p className="text-[11px] font-mono text-[#7B6E65] truncate">
                      {r.parentNumber || r.id} • {r.assignedGate}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-[#016836] shrink-0">
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
                  ? 'vip-pass-gradient border-[#8A6D3B]/40 border-t-4 border-t-[#8A6D3B]'
                  : 'pass-gradient border-[#E3DBD3] border-t-4 border-t-[#016836]'
              } rounded-2xl p-5 border shadow-sm printable-pass-area`}
            >
              <div className="flex items-center justify-between border-b border-[#E3DBD3] pb-3 mb-3">
                <img src="/sabis-logo.svg" alt="SABIS®" className="h-7 w-auto" />
                <span
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${
                    selectedReg.category === 'VIP'
                      ? 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/40'
                      : 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                  }`}
                >
                  {selectedReg.category === 'VIP' ? 'VIP' : 'Parent'}
                </span>
              </div>

              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-wider text-[#016836] font-bold">
                  Pass {activePass.passIndex} of {activePass.totalPasses}
                </p>
                <h3 className="text-base font-bold text-[#26211E] truncate mt-0.5">
                  {activePass.attendeeLabel || selectedReg.name}
                </h3>
                <p className="text-xs font-mono text-[#7B6E65] mt-0.5">
                  Parent #: {selectedReg.parentNumber || selectedReg.id}
                </p>
              </div>

              <div className="flex flex-col items-center my-3">
                <div
                  className={`bg-white p-3 rounded-2xl shadow-sm border-2 ${
                    selectedReg.category === 'VIP' ? 'border-[#8A6D3B]/40' : 'border-[#016836]/30'
                  }`}
                >
                  <QrCodeImage payload={buildPassQrPayload(selectedReg, activePass)} size={188} />
                </div>
                <p className="mt-2.5 font-mono text-xs font-bold tracking-widest text-[#016836] bg-white px-3 py-1 rounded-md border border-[#E3DBD3]">
                  {activePass.passCode}
                </p>
              </div>

              {selectedReg.passes.length > 1 && (
                <div className="flex items-center justify-between gap-2 mb-3 bg-white rounded-xl p-2 border border-[#E3DBD3] print:hidden">
                  <button
                    type="button"
                    disabled={safePassIdx === 0}
                    onClick={() => setActivePassIdx((i) => Math.max(0, i - 1))}
                    className="p-1.5 rounded-lg bg-[#F7F4F2] hover:bg-[#E3DBD3]/70 text-[#26211E] disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-[#26211E]">
                    Viewing Pass {safePassIdx + 1} of {selectedReg.passes.length}
                  </span>
                  <button
                    type="button"
                    disabled={safePassIdx >= selectedReg.passes.length - 1}
                    onClick={() => setActivePassIdx((i) => Math.min(selectedReg.passes.length - 1, i + 1))}
                    className="p-1.5 rounded-lg bg-[#F7F4F2] hover:bg-[#E3DBD3]/70 text-[#26211E] disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 text-xs bg-white/90 rounded-xl p-3 border border-[#E3DBD3]">
                <div>
                  <span className="text-[#7B6E65] block text-[11px]">Assigned Venue</span>
                  <span className="font-bold text-[#26211E] block truncate">{selectedReg.assignedGate}</span>
                </div>
                <div>
                  <span className="text-[#7B6E65] block text-[11px]">Pass Status</span>
                  <span
                    className={`font-bold ${
                      activePass.status === 'USED' ? 'text-[#016836]' : 'text-[#8A6D3B]'
                    }`}
                  >
                    {activePass.status === 'USED'
                      ? `Used (${formatTimeOnly(activePass.usedAt)})`
                      : 'Valid / Pending'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[#7B6E65] block text-[11px]">School</span>
                  <span className="font-medium text-[#26211E] block truncate">
                    {getSchoolDisplay(selectedReg)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => downloadPassPng(selectedReg, activePass, settings.eventTitle)}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-[#016836] hover:bg-[#01522B] text-white flex items-center justify-center gap-1 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save PNG</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#F7F4F2] text-[#26211E] border border-[#E3DBD3] flex items-center justify-center gap-1 transition"
              >
                <Printer className="w-3.5 h-3.5 text-[#016836]" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => onInspectAllPasses(selectedReg)}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-[#E6F4FA] hover:bg-[#0080BB] hover:text-white text-[#0080BB] border border-[#0080BB]/30 flex items-center justify-center gap-1 transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>All ({selectedReg.passes.length})</span>
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-[#7B6E65] py-8 text-center">No registrations for this event yet.</p>
        )}
      </div>
    </div>
  );
};

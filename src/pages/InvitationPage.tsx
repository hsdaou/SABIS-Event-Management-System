import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Download,
  MailCheck,
  MapPin,
  Printer,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { QrCodeImage } from '../components/QrCodeImage';
import { SchoolSelectorField } from '../components/SchoolSelectorField';
import { useEvent } from '../context/EventContext';
import { buildPassQrPayload, downloadPassPng, getSchoolDisplay } from '../lib/qr';
import type { OtherAttendeeDetail, Registration } from '../types';

export const InvitationPage: React.FC = () => {
  const { settings, venues, createRegistration, showToast } = useEvent();
  const [searchParams] = useSearchParams();

  const venueParam = searchParams.get('venue') || '';
  const tierParam = (searchParams.get('tier') || 'regular').toLowerCase();
  const isVip = tierParam === 'vip';

  const activeVenue = useMemo(() => {
    return (
      venues.find(
        (v) => v.slug === venueParam || v.id.toLowerCase() === venueParam.toLowerCase()
      ) || venues[0]
    );
  }, [venueParam, venues]);

  const toggles = settings.fieldToggles;

  const [parentNumber, setParentNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [numAttendees, setNumAttendees] = useState(1);
  const [schoolType, setSchoolType] = useState<'sabis_isc' | 'other' | ''>('');
  const [schoolBranch, setSchoolBranch] = useState('');
  const [schoolOther, setSchoolOther] = useState('');
  const [attendeeAges, setAttendeeAges] = useState<string[]>(['']);
  const [otherAttendees, setOtherAttendees] = useState<OtherAttendeeDetail[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [completedReg, setCompletedReg] = useState<Registration | null>(null);
  const [dispatchInfo, setDispatchInfo] = useState<string>('');

  const effectivePartySize = toggles.numAttendees ? Math.max(1, Math.min(20, numAttendees || 1)) : 1;

  const handleAttendeesChange = (val: number) => {
    const clamped = Math.max(1, Math.min(20, val || 1));
    setNumAttendees(clamped);
    setAttendeeAges((prev) => Array.from({ length: clamped }, (_, i) => prev[i] || ''));
    setOtherAttendees((prev) =>
      Array.from({ length: Math.max(0, clamped - 1) }, (_, i) => prev[i] || { name: '', contact: '' })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (toggles.school && !schoolType) {
      showToast('Please indicate which school your kids are attending.', 'warning');
      return;
    }
    if (toggles.school && schoolType === 'sabis_isc' && !schoolBranch) {
      showToast('Please select your SABIS® / ISC school branch from the dropdown.', 'warning');
      return;
    }
    if (
      settings.qrDeliveryMode === 'contact_info' &&
      !email.trim() &&
      !phone.trim()
    ) {
      showToast('Please provide an email or phone number to receive your QR pass(es).', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const { registration, dispatchMessage } = await createRegistration({
        parentNumber: toggles.parentNumber ? parentNumber : '',
        name: toggles.fullName ? fullName : parentNumber || email || 'Event Guest',
        phone: toggles.phone ? phone : '',
        email: toggles.email ? email : '',
        schoolType: toggles.school ? schoolType : '',
        schoolBranch: toggles.school ? schoolBranch : '',
        schoolOther: toggles.school ? schoolOther : '',
        category: isVip ? 'VIP' : 'Regular Parent',
        assignedGate: activeVenue?.name || 'Gate A - Main Campus Entrance',
        partySize: effectivePartySize,
        attendeeAges: toggles.attendeeAges ? attendeeAges.slice(0, effectivePartySize) : [],
        otherAttendees: toggles.otherAttendeeContacts
          ? otherAttendees.slice(0, Math.max(0, effectivePartySize - 1))
          : [],
        notes: `Registered via ${activeVenue?.name || 'Venue'} (${isVip ? 'VIP' : 'Regular'}) invitation link`,
        fromInvitationPage: true,
      });

      setCompletedReg(registration);
      setDispatchInfo(dispatchMessage || '');
      showToast(
        registration.deliveryMode === 'contact_info'
          ? `${registration.passes.length} QR pass(es) sent to your registered contact information!`
          : `Registration confirmed! Generated ${registration.passes.length} QR pass(es).`,
        'success'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCompletedReg(null);
    setDispatchInfo('');
    setParentNumber('');
    setFullName('');
    setEmail('');
    setPhone('');
    setNumAttendees(1);
    setSchoolType('');
    setSchoolBranch('');
    setSchoolOther('');
    setAttendeeAges(['']);
    setOtherAttendees([]);
  };

  const anyFieldVisible = Object.values(toggles).some(Boolean);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 sm:py-12 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className={`w-full ${completedReg && completedReg.passes.length > 1 ? 'max-w-3xl' : 'max-w-lg'} space-y-6`}>
        {/* Event Invitation Header — Locked Venue & Tier */}
        <div className="text-center space-y-2.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-lg ${
              isVip
                ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/25'
                : 'bg-gradient-to-br from-indigo-500 to-sky-500 shadow-indigo-500/25'
            }`}
          >
            <QrCode className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {settings.eventTitle}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              <MapPin className="w-3.5 h-3.5" />
              <span>Venue: {activeVenue?.name || 'Main Entrance'}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                isVip
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              }`}
            >
              {isVip ? '⭐ VIP Invitation Pass' : 'Regular Parent Pass'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            {settings.qrDeliveryMode === 'contact_info'
              ? 'Complete your registration below to receive your personal entry QR pass(es) on your registered contact details.'
              : 'Complete your registration below to generate your personal entry QR code pass(es).'}
          </p>
        </div>

        {/* STEP 1: Dynamic Invitation Registration Form */}
        {!completedReg ? (
          <div className="glass-panel rounded-2xl p-6 shadow-2xl border border-slate-700/80">
            {!anyFieldVisible ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Registration fields are currently hidden by the event administrator.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {toggles.parentNumber && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Parent Number <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={parentNumber}
                      onChange={(e) => setParentNumber(e.target.value)}
                      placeholder="e.g., PAR-10421"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {toggles.fullName && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Full Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Nadia Khoury"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {(toggles.email || toggles.phone) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {toggles.email && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                          Register Email <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="parent@example.com"
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                    {toggles.phone && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                          Register Phone Number <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+971 50 482 1900"
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </div>
                )}

                {toggles.school && (
                  <SchoolSelectorField
                    schoolType={schoolType}
                    schoolBranch={schoolBranch}
                    schoolOther={schoolOther}
                    onChangeType={setSchoolType}
                    onChangeBranch={setSchoolBranch}
                    onChangeOther={setSchoolOther}
                    required
                  />
                )}

                {toggles.numAttendees && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Number of Attendees <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={numAttendees}
                      onChange={(e) => handleAttendeesChange(parseInt(e.target.value, 10))}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-sky-300/90 mt-1">
                      {effectivePartySize} individual QR {effectivePartySize === 1 ? 'code' : 'codes'} will be{' '}
                      {settings.qrDeliveryMode === 'contact_info' ? 'sent' : 'generated'} (1 per attendee).
                    </p>
                  </div>
                )}

                {/* Age of Attendees (dynamic inputs matching Number of Attendees) */}
                {toggles.attendeeAges && (
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/80 space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Age of Attendees ({effectivePartySize})
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {Array.from({ length: effectivePartySize }).map((_, idx) => (
                        <div key={idx}>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Attendee {idx + 1} Age
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={110}
                            required
                            value={attendeeAges[idx] || ''}
                            onChange={(e) => {
                              const next = [...attendeeAges];
                              next[idx] = e.target.value;
                              setAttendeeAges(next);
                            }}
                            placeholder="Age"
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact Details of the Other Attendee(s) */}
                {toggles.otherAttendeeContacts && effectivePartySize > 1 && (
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/80 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-200">
                        Contact Details of the Other Attendee{effectivePartySize > 2 ? 's' : ''}
                      </label>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Enter the name and phone/email for each accompanying attendee
                      </p>
                    </div>
                    {otherAttendees.map((other, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800"
                      >
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Attendee {idx + 2} Full Name
                          </label>
                          <input
                            type="text"
                            required
                            value={other.name}
                            onChange={(e) => {
                              const next = [...otherAttendees];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setOtherAttendees(next);
                            }}
                            placeholder="Companion full name"
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Attendee {idx + 2} Phone / Email
                          </label>
                          <input
                            type="text"
                            required
                            value={other.contact}
                            onChange={(e) => {
                              const next = [...otherAttendees];
                              next[idx] = { ...next[idx], contact: e.target.value };
                              setOtherAttendees(next);
                            }}
                            placeholder="+971 50 ... or email"
                            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`w-full py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition disabled:opacity-50 ${
                      isVip
                        ? 'bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 shadow-amber-600/25'
                        : 'bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 shadow-indigo-600/25'
                    }`}
                  >
                    {submitting
                      ? 'Processing Registration...'
                      : settings.qrDeliveryMode === 'contact_info'
                      ? `Complete Registration & Send ${effectivePartySize} QR ${
                          effectivePartySize === 1 ? 'Code' : 'Codes'
                        }`
                      : `Complete Registration & Generate ${effectivePartySize} QR ${
                          effectivePartySize === 1 ? 'Code' : 'Codes'
                        }`}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : completedReg.deliveryMode === 'contact_info' ? (
          /* STEP 2A: QR Codes Dispatched to Registered Contact Info */
          <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl border border-emerald-500/40 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center mx-auto">
              <MailCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Registration Confirmed
              </span>
              <h2 className="text-xl font-bold text-white">
                {completedReg.passes.length} Entry QR {completedReg.passes.length === 1 ? 'Pass' : 'Passes'} Sent!
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
                Your unique QR entry {completedReg.passes.length === 1 ? 'pass has' : 'passes have'} been dispatched to your registered contact information:
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-left space-y-1.5 text-xs max-w-md mx-auto">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Registration ID:</span>
                <span className="font-mono font-bold text-sky-300">{completedReg.id}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Name:</span>
                <span className="font-semibold text-white">{completedReg.name}</span>
              </div>
              {completedReg.email && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-semibold text-emerald-300">{completedReg.email}</span>
                </div>
              )}
              {completedReg.phone && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Phone:</span>
                  <span className="font-semibold text-emerald-300">{completedReg.phone}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Venue:</span>
                <span className="font-semibold text-white">{completedReg.assignedGate}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">QR Passes Issued:</span>
                <span className="font-bold text-indigo-300">{completedReg.passes.length}</span>
              </div>
              {getSchoolDisplay(completedReg) !== 'Not specified' && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">School:</span>
                  <span className="text-slate-200 text-right">{getSchoolDisplay(completedReg)}</span>
                </div>
              )}
            </div>

            {dispatchInfo && (
              <p className="text-[11px] text-slate-400 max-w-md mx-auto">{dispatchInfo}</p>
            )}

            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Register Another Guest</span>
            </button>
          </div>
        ) : (
          /* STEP 2B: Multi-QR Passes Generated Immediately On Screen */
          <div className="glass-panel rounded-2xl p-6 shadow-2xl border border-emerald-500/40 space-y-5">
            <div className="text-center space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Registration Confirmed
              </span>
              <h2 className="text-lg font-bold text-white pt-1">
                Your {completedReg.passes.length} Event Entry QR{' '}
                {completedReg.passes.length === 1 ? 'Pass' : 'Passes'}
              </h2>
              <p className="text-xs text-slate-400">
                Each attendee must present their own QR code pass at the venue entrance.
              </p>
            </div>

            <div
              className={`grid grid-cols-1 ${
                completedReg.passes.length > 1 ? 'md:grid-cols-2' : ''
              } gap-4 printable-pass-area`}
            >
              {completedReg.passes.map((pass) => (
                <div
                  key={pass.passCode}
                  className={`${
                    isVip
                      ? 'vip-pass-gradient border-amber-500/40'
                      : 'pass-gradient border-indigo-500/30'
                  } rounded-2xl p-5 border text-center space-y-3`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isVip
                          ? 'bg-amber-500/25 text-amber-300 border-amber-400/40'
                          : 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30'
                      }`}
                    >
                      Pass {pass.passIndex} of {pass.totalPasses}
                    </span>
                    <span className="font-mono text-xs font-bold text-sky-300">{pass.passCode}</span>
                  </div>

                  <div>
                    <p className="text-base font-bold text-white">{pass.attendeeLabel}</p>
                    {completedReg.parentNumber && (
                      <p className="text-xs font-mono text-sky-300 mt-0.5">
                        Parent #: {completedReg.parentNumber}
                      </p>
                    )}
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {pass.attendeeAge ? `Age: ${pass.attendeeAge}` : ''}
                      {pass.attendeeAge && pass.attendeeContact ? ' • ' : ''}
                      {pass.attendeeContact || ''}
                    </div>
                  </div>

                  <div className="flex justify-center py-1">
                    <div className="bg-white p-3 rounded-2xl shadow-lg border-4 border-indigo-500/20">
                      <QrCodeImage payload={buildPassQrPayload(completedReg, pass)} size={184} />
                    </div>
                  </div>

                  <div className="text-xs bg-slate-900/70 rounded-xl p-2.5 border border-slate-800 text-left space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Venue:</span>
                      <span className="font-semibold text-white truncate">{completedReg.assignedGate}</span>
                    </div>
                    {getSchoolDisplay(completedReg) !== 'Not specified' && (
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">School:</span>
                        <span className="text-slate-200 truncate">{getSchoolDisplay(completedReg)}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => downloadPassPng(completedReg, pass, settings.eventTitle)}
                    className="w-full py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition print:hidden"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save Pass {pass.passIndex} PNG</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print All {completedReg.passes.length} Passes</span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/70 transition"
              >
                &larr; Register Another Parent
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

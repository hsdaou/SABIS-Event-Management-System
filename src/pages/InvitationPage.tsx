import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Download,
  Edit3,
  Mail,
  MailCheck,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { QrCodeImage } from '../components/QrCodeImage';
import { SchoolSelectorField } from '../components/SchoolSelectorField';
import { useEvent } from '../context/EventContext';
import { buildPassQrPayload, downloadPassPng, getSchoolDisplay } from '../lib/qr';
import type { OtherAttendeeDetail, Registration } from '../types';

export const InvitationPage: React.FC = () => {
  const {
    getEventBySlugOrId,
    getVenuesForEvent,
    findExistingRegistration,
    createRegistration,
    updateExistingRegistration,
    showToast,
  } = useEvent();
  const [searchParams] = useSearchParams();

  const eventParam = searchParams.get('event');
  const venueParam = searchParams.get('venue') || '';
  const tierParam = (searchParams.get('tier') || 'parent').toLowerCase();
  const isVip = tierParam === 'vip';

  const targetEvent = useMemo(
    () => getEventBySlugOrId(eventParam),
    [eventParam, getEventBySlugOrId]
  );

  const eventVenues = useMemo(
    () => getVenuesForEvent(targetEvent.id),
    [getVenuesForEvent, targetEvent.id]
  );

  const activeVenue = useMemo(() => {
    return (
      eventVenues.find(
        (v) => v.slug === venueParam || v.id.toLowerCase() === venueParam.toLowerCase()
      ) || eventVenues[0]
    );
  }, [eventVenues, venueParam]);

  const toggles = targetEvent.fieldToggles;
  const requiredFields = targetEvent.requiredFields;

  const [parentNumber, setParentNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [numAttendeesInput, setNumAttendeesInput] = useState('1');
  const [schoolType, setSchoolType] = useState<'sabis_isc' | 'other' | ''>('');
  const [schoolBranch, setSchoolBranch] = useState('');
  const [schoolOther, setSchoolOther] = useState('');
  const [attendeeAges, setAttendeeAges] = useState<string[]>(['']);
  const [otherAttendees, setOtherAttendees] = useState<OtherAttendeeDetail[]>([]);

  // Duplicate prevention & Edit Previous Registration state
  const [showEditLookup, setShowEditLookup] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<Registration | null>(null);
  const [editingReg, setEditingReg] = useState<Registration | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [completedReg, setCompletedReg] = useState<Registration | null>(null);
  const [dispatchInfo, setDispatchInfo] = useState<string>('');
  const [wasEdited, setWasEdited] = useState(false);

  const parsedAttendees = parseInt(numAttendeesInput, 10);
  const effectivePartySize = toggles.numAttendees
    ? Number.isFinite(parsedAttendees) && parsedAttendees >= 1
      ? Math.min(20, parsedAttendees)
      : 1
    : 1;

  const handleAttendeesInputChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 2);
    if (digitsOnly === '') {
      setNumAttendeesInput('');
      return;
    }
    const parsed = parseInt(digitsOnly, 10);
    if (parsed > 20) {
      setNumAttendeesInput('20');
      setAttendeeAges((prev) => Array.from({ length: 20 }, (_, i) => prev[i] || ''));
      setOtherAttendees((prev) =>
        Array.from({ length: 19 }, (_, i) => prev[i] || { name: '', contact: '' })
      );
      return;
    }
    setNumAttendeesInput(digitsOnly);
    const countForFields = Math.max(1, parsed);
    setAttendeeAges((prev) => Array.from({ length: countForFields }, (_, i) => prev[i] || ''));
    setOtherAttendees((prev) =>
      Array.from({ length: Math.max(0, countForFields - 1) }, (_, i) => prev[i] || { name: '', contact: '' })
    );
  };

  const loadRegistrationIntoEditForm = (reg: Registration) => {
    const size = Math.max(1, reg.partySize || reg.passes.length || 1);
    setEditingReg(reg);
    setDuplicateMatch(null);
    setCompletedReg(null);
    setShowEditLookup(false);
    setParentNumber(reg.parentNumber || '');
    setFullName(reg.name || '');
    setEmail(reg.email || '');
    setPhone(reg.phone || '');
    setNumAttendeesInput(String(size));
    setSchoolType(reg.schoolType || '');
    setSchoolBranch(reg.schoolBranch || '');
    setSchoolOther(reg.schoolOther || '');
    setAttendeeAges(Array.from({ length: size }, (_, i) => reg.attendeeAges?.[i] || reg.passes?.[i]?.attendeeAge || ''));
    setOtherAttendees(
      Array.from({ length: Math.max(0, size - 1) }, (_, i) => ({
        name: reg.otherAttendees?.[i]?.name || reg.passes?.[i + 1]?.attendeeLabel || '',
        contact: reg.otherAttendees?.[i]?.contact || reg.passes?.[i + 1]?.attendeeContact || '',
      }))
    );
    showToast(`Loaded registration ${reg.id} for editing`, 'info');
  };

  const handleFindExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = lookupInput.trim();
    if (!val) {
      showToast('Enter your Parent Number, registered Email, or Phone Number.', 'warning');
      return;
    }
    setLookupBusy(true);
    try {
      const found = await findExistingRegistration(targetEvent.id, {
        parentNumber: val.includes('@') ? '' : val,
        email: val.includes('@') ? val : '',
        phone: val,
      });
      if (!found) {
        showToast('No previous registration found for this event with those details.', 'warning');
        return;
      }
      loadRegistrationIntoEditForm(found);
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateMatch(null);

    if (toggles.parentNumber && requiredFields.parentNumber && !parentNumber.trim()) {
      showToast('Parent Number is required.', 'warning');
      return;
    }
    if (toggles.fullName && requiredFields.fullName && !fullName.trim()) {
      showToast('Full Name is required.', 'warning');
      return;
    }
    if (toggles.phone && requiredFields.phone && !phone.trim()) {
      showToast('Phone number is required by the event organizer.', 'warning');
      return;
    }
    if (toggles.email && requiredFields.email && !email.trim()) {
      showToast('Email address is required by the event organizer.', 'warning');
      return;
    }
    if (
      toggles.numAttendees &&
      requiredFields.numAttendees &&
      (!numAttendeesInput.trim() || !Number.isFinite(parsedAttendees) || parsedAttendees < 1)
    ) {
      showToast('Please enter the Number of Attendees (1 to 20).', 'warning');
      return;
    }
    if (toggles.school && requiredFields.school) {
      if (!schoolType) {
        showToast('Please indicate which school your kids are attending.', 'warning');
        return;
      }
      if (schoolType === 'sabis_isc' && !schoolBranch) {
        showToast('Please select your SABIS® / ISC school branch from the dropdown.', 'warning');
        return;
      }
      if (schoolType === 'other' && !schoolOther.trim()) {
        showToast('Please enter your school name.', 'warning');
        return;
      }
    }
    if (toggles.attendeeAges && requiredFields.attendeeAges) {
      const missingAge = Array.from({ length: effectivePartySize }).some(
        (_, idx) => !(attendeeAges[idx] || '').trim()
      );
      if (missingAge) {
        showToast('Please enter the age for each attendee.', 'warning');
        return;
      }
    }
    if (toggles.otherAttendeeContacts && requiredFields.otherAttendeeContacts && effectivePartySize > 1) {
      const missingOther = otherAttendees
        .slice(0, effectivePartySize - 1)
        .some((o) => !o.name.trim() || !o.contact.trim());
      if (missingOther) {
        showToast('Please enter name and contact details for each accompanying attendee.', 'warning');
        return;
      }
    }
    if (
      targetEvent.qrDeliveryMode === 'contact_info' &&
      !email.trim() &&
      !phone.trim()
    ) {
      showToast('Please enter your email or phone number to receive your QR pass(es).', 'warning');
      return;
    }

    const payload = {
      eventId: targetEvent.id,
      parentNumber: toggles.parentNumber ? parentNumber : editingReg?.parentNumber || '',
      name: toggles.fullName
        ? fullName
        : editingReg?.name || parentNumber || email || phone || 'Event Guest',
      phone: toggles.phone ? phone : editingReg?.phone || '',
      email: toggles.email ? email : editingReg?.email || '',
      schoolType: toggles.school ? schoolType : editingReg?.schoolType || '',
      schoolBranch: toggles.school ? schoolBranch : editingReg?.schoolBranch || '',
      schoolOther: toggles.school ? schoolOther : editingReg?.schoolOther || '',
      category: editingReg ? editingReg.category : ((isVip ? 'VIP' : 'Parent') as 'VIP' | 'Parent'),
      assignedGate: editingReg?.assignedGate || activeVenue?.name || 'Gate A - Main Campus Entrance',
      partySize: effectivePartySize,
      attendeeAges: toggles.attendeeAges ? attendeeAges.slice(0, effectivePartySize) : [],
      otherAttendees: toggles.otherAttendeeContacts
        ? otherAttendees.slice(0, Math.max(0, effectivePartySize - 1))
        : [],
      notes: editingReg
        ? `Updated registration via ${activeVenue?.name || 'Venue'} invitation link`
        : `Registered via ${activeVenue?.name || 'Venue'} (${isVip ? 'VIP' : 'Parent'}) invitation link`,
      fromInvitationPage: true,
    };

    setSubmitting(true);
    try {
      // Edit existing registration flow
      if (editingReg) {
        const res = await updateExistingRegistration(editingReg.id, payload);
        if (!res.ok || !res.registration) {
          showToast(res.error || 'Could not update your registration.', 'error');
          return;
        }
        setCompletedReg(res.registration);
        setDispatchInfo(res.dispatchMessage || '');
        setWasEdited(true);
        setEditingReg(null);
        showToast(
          res.registration.deliveryMode === 'contact_info'
            ? res.registration.deliveryStatus === 'sent'
              ? `Registration updated & ${res.registration.passes.length} QR pass(es) resent to ${res.registration.email}!`
              : res.dispatchMessage || 'Registration updated.'
            : `Registration updated! Your ${res.registration.passes.length} SABIS® QR pass(es) are ready.`,
          'success'
        );
        return;
      }

      // New registration flow (automatically checks & blocks duplicates!)
      const { registration, duplicate, dispatchMessage } = await createRegistration(payload);

      if (duplicate) {
        setDuplicateMatch(duplicate);
        showToast(
          'You have already registered for this event. You can edit your existing registration below.',
          'warning'
        );
        return;
      }

      if (!registration) return;

      setCompletedReg(registration);
      setDispatchInfo(dispatchMessage || '');
      setWasEdited(false);
      showToast(
        registration.deliveryMode === 'contact_info'
          ? registration.deliveryStatus === 'sent'
            ? `${registration.passes.length} SABIS® QR pass(es) emailed to ${registration.email}!`
            : dispatchMessage || 'Registration saved, but email could not be delivered yet.'
          : `Registration confirmed! Generated ${registration.passes.length} SABIS® QR pass(es).`,
        registration.deliveryMode === 'contact_info' && registration.deliveryStatus !== 'sent'
          ? 'warning'
          : 'success'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCompletedReg(null);
    setEditingReg(null);
    setDuplicateMatch(null);
    setDispatchInfo('');
    setWasEdited(false);
    setParentNumber('');
    setFullName('');
    setEmail('');
    setPhone('');
    setNumAttendeesInput('1');
    setSchoolType('');
    setSchoolBranch('');
    setSchoolOther('');
    setAttendeeAges(['']);
    setOtherAttendees([]);
  };

  const anyFieldVisible = Object.values(toggles).some(Boolean);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 sm:py-12 bg-[#F7F4F2]">
      <div className={`w-full ${completedReg && completedReg.passes.length > 1 ? 'max-w-3xl' : 'max-w-lg'} space-y-6`}>
        {/* Official SABIS® Header — Locked Event, Venue & Tier */}
        <div className="text-center space-y-3">
          <img src="/sabis-logo.svg" alt="SABIS® Logo" className="h-12 w-auto mx-auto" />
          <h1 className="text-xl sm:text-2xl font-bold text-[#26211E] tracking-tight">
            {targetEvent.name}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {targetEvent.eventDate && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white text-[#26211E] border border-[#E3DBD3]">
                <Calendar className="w-3.5 h-3.5 text-[#016836]" />
                <span>{targetEvent.eventDate}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E6F4FA] text-[#0080BB] border border-[#0080BB]/25">
              <MapPin className="w-3.5 h-3.5" />
              <span>Venue: {activeVenue?.name || 'Main Entrance'}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                isVip
                  ? 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/40'
                  : 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
              }`}
            >
              {isVip ? 'VIP' : 'Parent'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#7B6E65]">
            {targetEvent.qrDeliveryMode === 'contact_info'
              ? 'Complete your registration below to receive your personal SABIS® entry QR pass(es) on your registered contact details.'
              : 'Complete your registration below to generate your personal SABIS® entry QR code pass(es).'}
          </p>
        </div>

        {/* STEP 1: Dynamic Invitation Registration Form (with Duplicate Protection & Edit Mode) */}
        {!completedReg ? (
          <div
            className={`glass-panel rounded-2xl p-6 sm:p-7 border-t-4 space-y-5 ${
              isVip ? 'border-t-[#8A6D3B]' : 'border-t-[#016836]'
            }`}
          >
            {/* Already Registered? Lookup & Edit Bar */}
            {!editingReg ? (
              <div className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#26211E] flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-[#016836]" />
                    <span>Already registered for this event?</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEditLookup((v) => !v)}
                    className="text-xs font-bold text-[#016836] hover:underline"
                  >
                    {showEditLookup ? 'Hide Lookup' : 'Edit My Registration'}
                  </button>
                </div>

                {showEditLookup && (
                  <form onSubmit={handleFindExisting} className="flex flex-col sm:flex-row gap-2 pt-1">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-[#7B6E65] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={lookupInput}
                        onChange={(e) => setLookupInput(e.target.value)}
                        placeholder="Enter Parent #, Email, or Phone Number..."
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={lookupBusy}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white shrink-0 transition disabled:opacity-50"
                    >
                      {lookupBusy ? 'Searching...' : 'Find & Edit'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#EDF6F1] border border-[#016836]/35 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#016836] flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editing Existing Registration ({editingReg.id})</span>
                  </p>
                  <p className="text-[11px] text-[#7B6E65] mt-0.5">
                    Update your details or attendee count below — existing scanned passes remain preserved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-[#E3DBD3] text-[#7B6E65] hover:text-[#26211E] flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            )}

            {/* Duplicate Registration Blocked Banner */}
            {duplicateMatch && !editingReg && (
              <div className="p-4 rounded-xl bg-[#FCF8E3] border border-[#8A6D3B]/45 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-[#8A6D3B] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#26211E] space-y-1">
                    <p className="font-bold text-[#8A6D3B]">
                      Duplicate Registration Not Allowed
                    </p>
                    <p>
                      A registration already exists for <strong>{duplicateMatch.name}</strong> (
                      <span className="font-mono">{duplicateMatch.id}</span>) on this event. You cannot register more than once, but you can edit your previous registration.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadRegistrationIntoEditForm(duplicateMatch)}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-[#8A6D3B] hover:bg-[#70572E] text-white flex items-center justify-center gap-1.5 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Load &amp; Edit My Previous Registration</span>
                </button>
              </div>
            )}

            {!anyFieldVisible ? (
              <div className="py-6 text-center text-xs text-[#7B6E65]">
                Registration fields are currently hidden by the event administrator.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {toggles.parentNumber && (
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-[#26211E] mb-1.5">
                      <span>Parent Number</span>
                      {requiredFields.parentNumber ? (
                        <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
                      ) : (
                        <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={requiredFields.parentNumber}
                      value={parentNumber}
                      onChange={(e) => setParentNumber(e.target.value)}
                      placeholder="e.g., PAR-10421"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm font-mono text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                    />
                  </div>
                )}

                {toggles.fullName && (
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-[#26211E] mb-1.5">
                      <span>Full Name</span>
                      {requiredFields.fullName ? (
                        <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
                      ) : (
                        <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={requiredFields.fullName}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Nadia Khoury"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                    />
                  </div>
                )}

                {toggles.phone && (
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-[#26211E] mb-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#016836]" />
                        <span>Register Phone Number</span>
                      </span>
                      {requiredFields.phone ? (
                        <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
                      ) : (
                        <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
                      )}
                    </label>
                    <input
                      type="tel"
                      required={requiredFields.phone}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+971 50 482 1900"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                    />
                  </div>
                )}

                {toggles.email && (
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-[#26211E] mb-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#016836]" />
                        <span>Register Email Address</span>
                      </span>
                      {requiredFields.email ? (
                        <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
                      ) : (
                        <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
                      )}
                    </label>
                    <input
                      type="email"
                      required={requiredFields.email}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="parent@example.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                    />
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
                    required={requiredFields.school}
                  />
                )}

                {toggles.numAttendees && (
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-[#26211E] mb-1.5">
                      <span>Number of Attendees</span>
                      {requiredFields.numAttendees ? (
                        <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
                      ) : (
                        <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
                      )}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      required={requiredFields.numAttendees}
                      value={numAttendeesInput}
                      onChange={(e) => handleAttendeesInputChange(e.target.value)}
                      placeholder="Type number of attendees (1–20)"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                    />
                    <p className="text-[11px] text-[#016836] font-medium mt-1">
                      {effectivePartySize} individual SABIS® QR {effectivePartySize === 1 ? 'code' : 'codes'} will be{' '}
                      {targetEvent.qrDeliveryMode === 'contact_info' ? 'sent' : 'generated'} (1 per attendee).
                    </p>
                  </div>
                )}

                {toggles.attendeeAges && (
                  <div className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] space-y-2">
                    <label className="flex items-center justify-between text-xs font-bold text-[#26211E]">
                      <span>Age of Attendees ({effectivePartySize})</span>
                      {requiredFields.attendeeAges ? (
                        <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
                      ) : (
                        <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
                      )}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {Array.from({ length: effectivePartySize }).map((_, idx) => (
                        <div key={idx}>
                          <label className="block text-[11px] text-[#7B6E65] mb-1">
                            Attendee {idx + 1} Age
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            required={requiredFields.attendeeAges}
                            value={attendeeAges[idx] || ''}
                            onChange={(e) => {
                              const next = [...attendeeAges];
                              next[idx] = e.target.value.replace(/\D/g, '').slice(0, 3);
                              setAttendeeAges(next);
                            }}
                            placeholder="Age"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E] focus:outline-none focus:border-[#016836]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {toggles.otherAttendeeContacts && effectivePartySize > 1 && (
                  <div className="p-3.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] space-y-3">
                    <div>
                      <label className="flex items-center justify-between text-xs font-bold text-[#26211E]">
                        <span>Contact Details of the Other Attendee{effectivePartySize > 2 ? 's' : ''}</span>
                        {requiredFields.otherAttendeeContacts ? (
                          <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
                        ) : (
                          <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
                        )}
                      </label>
                      <p className="text-[11px] text-[#7B6E65] mt-0.5">
                        Enter the name and phone/email for each accompanying attendee
                      </p>
                    </div>
                    {otherAttendees.map((other, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-white border border-[#E3DBD3]"
                      >
                        <div>
                          <label className="block text-[11px] text-[#7B6E65] mb-1">
                            Attendee {idx + 2} Full Name
                          </label>
                          <input
                            type="text"
                            required={requiredFields.otherAttendeeContacts}
                            value={other.name}
                            onChange={(e) => {
                              const next = [...otherAttendees];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setOtherAttendees(next);
                            }}
                            placeholder="Companion full name"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E] focus:outline-none focus:border-[#016836]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#7B6E65] mb-1">
                            Attendee {idx + 2} Phone / Email
                          </label>
                          <input
                            type="text"
                            required={requiredFields.otherAttendeeContacts}
                            value={other.contact}
                            onChange={(e) => {
                              const next = [...otherAttendees];
                              next[idx] = { ...next[idx], contact: e.target.value };
                              setOtherAttendees(next);
                            }}
                            placeholder="+971 50 ... or email"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#B6ADA4] text-xs text-[#26211E] focus:outline-none focus:border-[#016836]"
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
                    className={`w-full py-3 rounded-xl text-sm font-bold text-white shadow-md transition disabled:opacity-50 ${
                      isVip
                        ? 'bg-[#8A6D3B] hover:bg-[#70572E] shadow-[#8A6D3B]/20'
                        : 'bg-[#016836] hover:bg-[#01522B] shadow-[#016836]/20'
                    }`}
                  >
                    {submitting
                      ? editingReg
                        ? 'Saving Changes...'
                        : 'Processing Registration...'
                      : editingReg
                      ? `Save Changes & Update ${effectivePartySize} QR ${
                          effectivePartySize === 1 ? 'Pass' : 'Passes'
                        }`
                      : targetEvent.qrDeliveryMode === 'contact_info'
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
          <div className="glass-panel rounded-2xl p-6 sm:p-8 border-t-4 border-t-[#016836] text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-[#DFF0D8] border border-[#016836]/25 flex items-center justify-center mx-auto">
              <MailCheck className="w-8 h-8 text-[#016836]" />
            </div>
            <div className="space-y-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  completedReg.deliveryStatus === 'sent'
                    ? 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                    : 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/35'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {wasEdited
                  ? completedReg.deliveryStatus === 'sent'
                    ? 'Registration Updated & Emailed'
                    : 'Registration Updated — Email Queued'
                  : completedReg.deliveryStatus === 'sent'
                  ? 'Registration Confirmed & Emailed'
                  : 'Registration Saved — Email Queued'}
              </span>
              <h2 className="text-xl font-bold text-[#26211E]">
                {completedReg.deliveryStatus === 'sent'
                  ? `${completedReg.passes.length} SABIS® Entry QR ${
                      completedReg.passes.length === 1 ? 'Pass' : 'Passes'
                    } Sent!`
                  : `Registration Confirmed (${completedReg.passes.length} QR ${
                      completedReg.passes.length === 1 ? 'Pass' : 'Passes'
                    } Issued)`}
              </h2>
              <p className="text-xs sm:text-sm text-[#7B6E65] max-w-md mx-auto">
                {completedReg.deliveryStatus === 'sent'
                  ? `Your unique QR entry ${
                      completedReg.passes.length === 1 ? 'pass has' : 'passes have'
                    } been delivered to your registered email address:`
                  : 'Your registration is recorded. See delivery status below:'}
              </p>
            </div>

            <div className="bg-[#F7F4F2] border border-[#E3DBD3] rounded-xl p-4 text-left space-y-1.5 text-xs max-w-md mx-auto">
              <div className="flex justify-between gap-2">
                <span className="text-[#7B6E65]">Event:</span>
                <span className="font-bold text-[#26211E] text-right">{targetEvent.name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#7B6E65]">Registration ID:</span>
                <span className="font-mono font-bold text-[#016836]">{completedReg.id}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#7B6E65]">Name:</span>
                <span className="font-bold text-[#26211E]">{completedReg.name}</span>
              </div>
              {completedReg.email && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#7B6E65]">Email:</span>
                  <span className="font-semibold text-[#016836]">{completedReg.email}</span>
                </div>
              )}
              {completedReg.phone && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#7B6E65]">Phone:</span>
                  <span className="font-semibold text-[#016836]">{completedReg.phone}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-[#7B6E65]">Venue:</span>
                <span className="font-semibold text-[#26211E]">{completedReg.assignedGate}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#7B6E65]">QR Passes Issued:</span>
                <span className="font-bold text-[#016836]">{completedReg.passes.length}</span>
              </div>
              {getSchoolDisplay(completedReg) !== 'Not specified' && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#7B6E65]">School:</span>
                  <span className="text-[#26211E] text-right">{getSchoolDisplay(completedReg)}</span>
                </div>
              )}
            </div>

            {dispatchInfo && (
              <p className="text-[11px] text-[#7B6E65] max-w-md mx-auto">{dispatchInfo}</p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => loadRegistrationIntoEditForm(completedReg)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit My Registration</span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#26211E] bg-[#F7F4F2] hover:bg-[#E3DBD3]/60 border border-[#E3DBD3] transition"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#016836]" />
                <span>Done</span>
              </button>
            </div>
          </div>
        ) : (
          /* STEP 2B: Multi-QR SABIS®-Branded Passes Generated Immediately On Screen */
          <div className="glass-panel rounded-2xl p-6 border-t-4 border-t-[#016836] space-y-5">
            <div className="text-center space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#DFF0D8] text-[#016836] border border-[#016836]/25">
                <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                {wasEdited ? 'Registration Updated' : 'Registration Confirmed'}
              </span>
              <h2 className="text-lg font-bold text-[#26211E] pt-1">
                Your {completedReg.passes.length} SABIS® Event Entry QR{' '}
                {completedReg.passes.length === 1 ? 'Pass' : 'Passes'}
              </h2>
              <p className="text-xs text-[#7B6E65]">
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
                      ? 'vip-pass-gradient border-[#8A6D3B]/40 border-t-4 border-t-[#8A6D3B]'
                      : 'pass-gradient border-[#E3DBD3] border-t-4 border-t-[#016836]'
                  } rounded-2xl p-5 border text-center space-y-3 shadow-sm`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[#E3DBD3] pb-2.5">
                    <img src="/sabis-logo.svg" alt="SABIS®" className="h-6 w-auto" />
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isVip
                          ? 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/40'
                          : 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                      }`}
                    >
                      Pass {pass.passIndex} of {pass.totalPasses}
                    </span>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#7B6E65]">
                      {targetEvent.name}
                    </p>
                    <p className="text-base font-bold text-[#26211E] mt-0.5">{pass.attendeeLabel}</p>
                    {completedReg.parentNumber && (
                      <p className="text-xs font-mono font-semibold text-[#016836] mt-0.5">
                        Parent #: {completedReg.parentNumber}
                      </p>
                    )}
                    <div className="text-[11px] text-[#7B6E65] mt-0.5">
                      {pass.attendeeAge ? `Age: ${pass.attendeeAge}` : ''}
                      {pass.attendeeAge && pass.attendeeContact ? ' • ' : ''}
                      {pass.attendeeContact || ''}
                    </div>
                  </div>

                  <div className="flex justify-center py-1">
                    <div
                      className={`bg-white p-3 rounded-2xl shadow-sm border-2 ${
                        isVip ? 'border-[#8A6D3B]/40' : 'border-[#016836]/30'
                      }`}
                    >
                      <QrCodeImage payload={buildPassQrPayload(completedReg, pass)} size={196} />
                    </div>
                  </div>

                  <p className="font-mono text-xs font-bold text-[#016836] bg-white inline-block px-3 py-1 rounded-md border border-[#E3DBD3]">
                    {pass.passCode}
                  </p>

                  <div className="text-xs bg-white/90 rounded-xl p-2.5 border border-[#E3DBD3] text-left space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-[#7B6E65]">Venue:</span>
                      <span className="font-bold text-[#26211E] truncate">{completedReg.assignedGate}</span>
                    </div>
                    {getSchoolDisplay(completedReg) !== 'Not specified' && (
                      <div className="flex justify-between gap-2">
                        <span className="text-[#7B6E65]">School:</span>
                        <span className="text-[#26211E] truncate">{getSchoolDisplay(completedReg)}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => downloadPassPng(completedReg, pass, targetEvent.name)}
                    className={`w-full py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition print:hidden ${
                      isVip ? 'bg-[#8A6D3B] hover:bg-[#70572E]' : 'bg-[#016836] hover:bg-[#01522B]'
                    }`}
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
                onClick={() => loadRegistrationIntoEditForm(completedReg)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white flex items-center gap-1.5 transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit My Registration</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white hover:bg-[#F7F4F2] text-[#26211E] border border-[#E3DBD3] flex items-center gap-1.5 transition"
              >
                <Printer className="w-3.5 h-3.5 text-[#016836]" />
                <span>Print All {completedReg.passes.length} Passes</span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#7B6E65] hover:text-[#26211E] transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

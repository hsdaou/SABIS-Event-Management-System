import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Hourglass,
  QrCode,
  ShieldAlert,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { formatTimeOnly, getRegistrationStatus, getSchoolDisplay } from '../lib/qr';
import type { Registration, ScanLog } from '../types';

export type KpiCardKey = 'registered' | 'checkedIn' | 'pending' | 'attendees' | 'alerts';

interface KpiStripProps {
  registrations: Registration[];
  scanLogs: ScanLog[];
  onInspectPasses: (reg: Registration) => void;
}

export const KpiStrip: React.FC<KpiStripProps> = ({
  registrations,
  scanLogs,
  onInspectPasses,
}) => {
  const [activeModal, setActiveModal] = useState<KpiCardKey | null>(null);
  const [detailSearch, setDetailSearch] = useState('');

  const metrics = useMemo(() => {
    const totalParents = registrations.length;
    const arrivedParents = registrations.filter((r) => getRegistrationStatus(r) !== 'PENDING');
    const pendingParents = registrations.filter((r) => getRegistrationStatus(r) === 'PENDING');
    const allPasses = registrations.flatMap((r) =>
      r.passes.map((p) => ({ pass: p, registration: r }))
    );
    const arrivedPasses = allPasses.filter((x) => x.pass.status === 'USED');
    const alertLogs = scanLogs.filter((l) => l.status === 'INVALID' || l.status === 'USED');
    const checkInRate = totalParents > 0 ? Math.round((arrivedParents.length / totalParents) * 100) : 0;

    return {
      totalParents,
      arrivedParents,
      pendingParents,
      allPasses,
      arrivedPasses,
      alertLogs,
      checkInRate,
    };
  }, [registrations, scanLogs]);

  const openModal = (key: KpiCardKey) => {
    setDetailSearch('');
    setActiveModal(key);
  };

  const q = detailSearch.trim().toLowerCase();

  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* 1. Registered Parents */}
        <button
          type="button"
          onClick={() => openModal('registered')}
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 border-t-4 border-t-[#016836] transition hover:border-[#016836] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#016836]/40 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-[#7B6E65] font-semibold flex items-center gap-1">
              <span>Registered Parents</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#016836] transition" />
            </p>
            <p className="text-2xl font-extrabold text-[#26211E] mt-1">{metrics.totalParents}</p>
            <p className="text-[10px] text-[#016836] font-medium mt-0.5">Click for details</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#016836]/10 border border-[#016836]/20 flex items-center justify-center text-[#016836] shrink-0 group-hover:scale-105 transition">
            <Users className="w-5 h-5" />
          </div>
        </button>

        {/* 2. Checked In (Arrived) */}
        <button
          type="button"
          onClick={() => openModal('checkedIn')}
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 border-t-4 border-t-[#046937] transition hover:border-[#046937] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#046937]/40 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-[#7B6E65] font-semibold flex items-center gap-1">
              <span>Checked In (Arrived)</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#046937] transition" />
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-extrabold text-[#016836]">{metrics.arrivedParents.length}</p>
              <span className="text-xs text-[#016836] font-bold">{metrics.checkInRate}%</span>
            </div>
            <p className="text-[10px] text-[#016836] font-medium mt-0.5">Click for details</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#DFF0D8] border border-[#016836]/25 flex items-center justify-center text-[#016836] shrink-0 group-hover:scale-105 transition">
            <Check className="w-5 h-5" />
          </div>
        </button>

        {/* 3. Didn't Arrive Yet */}
        <button
          type="button"
          onClick={() => openModal('pending')}
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 border-t-4 border-t-[#8A6D3B] transition hover:border-[#8A6D3B] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#8A6D3B]/40 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-[#7B6E65] font-semibold flex items-center gap-1">
              <span>Didn&apos;t Arrive Yet</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#8A6D3B] transition" />
            </p>
            <p className="text-2xl font-extrabold text-[#8A6D3B] mt-1">{metrics.pendingParents.length}</p>
            <p className="text-[10px] text-[#8A6D3B] font-medium mt-0.5">Click for details</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FCF8E3] border border-[#8A6D3B]/30 flex items-center justify-center text-[#8A6D3B] shrink-0 group-hover:scale-105 transition">
            <Hourglass className="w-5 h-5" />
          </div>
        </button>

        {/* 4. Total Attendees (Arrived / Reg) */}
        <button
          type="button"
          onClick={() => openModal('attendees')}
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 border-t-4 border-t-[#0080BB] transition hover:border-[#0080BB] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#0080BB]/40 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-[#7B6E65] font-semibold flex items-center gap-1">
              <span className="truncate">Total Attendees (Arrived / Reg)</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#0080BB] shrink-0 transition" />
            </p>
            <p className="text-2xl font-extrabold text-[#0080BB] mt-1">
              {metrics.arrivedPasses.length} / {metrics.allPasses.length}
            </p>
            <p className="text-[10px] text-[#0080BB] font-medium mt-0.5">Click for pass breakdown</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#E6F4FA] border border-[#0080BB]/25 flex items-center justify-center text-[#0080BB] shrink-0 group-hover:scale-105 transition">
            <Ticket className="w-5 h-5" />
          </div>
        </button>

        {/* 5. Gate Scan Alerts */}
        <button
          type="button"
          onClick={() => openModal('alerts')}
          className="group glass-panel rounded-2xl p-4 col-span-2 lg:col-span-1 text-left flex items-center justify-between gap-2 border-t-4 border-t-[#E53C2E] transition hover:border-[#E53C2E] hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#E53C2E]/40 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-[#7B6E65] font-semibold flex items-center gap-1">
              <span>Gate Scan Alerts</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#E53C2E] transition" />
            </p>
            <p className="text-2xl font-extrabold text-[#E53C2E] mt-1">{metrics.alertLogs.length}</p>
            <p className="text-[10px] text-[#E53C2E] font-medium mt-0.5">Invalid &amp; Used scans</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#F2DEDE] border border-[#E53C2E]/30 flex items-center justify-center text-[#E53C2E] shrink-0 group-hover:scale-105 transition">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </button>
      </section>

      {/* ==================== CLICKABLE KPI DETAIL MODAL ==================== */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-[#26211E]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-[#E3DBD3] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E3DBD3] bg-[#F7F4F2] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#26211E]">
                  {activeModal === 'registered' && `Registered Parents (${metrics.totalParents})`}
                  {activeModal === 'checkedIn' &&
                    `Checked In Parents — Arrived (${metrics.arrivedParents.length})`}
                  {activeModal === 'pending' &&
                    `Didn't Arrive Yet (${metrics.pendingParents.length})`}
                  {activeModal === 'attendees' &&
                    `All Individual Attendee Passes (${metrics.arrivedPasses.length} Arrived / ${metrics.allPasses.length} Registered)`}
                  {activeModal === 'alerts' &&
                    `Gate Scan Alerts — Invalid & Used (${metrics.alertLogs.length})`}
                </h3>
                <p className="text-xs text-[#7B6E65] mt-0.5">
                  Live detailed breakdown • Click any parent row to inspect their SABIS® QR passes
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Filter details..."
                  className="px-3 py-1.5 rounded-xl bg-white border border-[#B6ADA4] text-xs text-[#26211E] placeholder-[#7B6E65] focus:outline-none focus:border-[#016836]"
                />
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded-lg text-[#7B6E65] hover:text-[#26211E] hover:bg-[#E3DBD3]/50 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-2.5 bg-[#F7F4F2]/40">
              {(activeModal === 'registered' ||
                activeModal === 'checkedIn' ||
                activeModal === 'pending') &&
                (() => {
                  const source =
                    activeModal === 'registered'
                      ? registrations
                      : activeModal === 'checkedIn'
                      ? metrics.arrivedParents
                      : metrics.pendingParents;
                  const rows = source.filter((r) => {
                    if (!q) return true;
                    return `${r.parentNumber} ${r.name} ${r.phone} ${r.email} ${r.assignedGate} ${getSchoolDisplay(r)} ${r.category}`
                      .toLowerCase()
                      .includes(q);
                  });

                  if (rows.length === 0) {
                    return (
                      <p className="py-10 text-center text-xs text-[#7B6E65]">
                        No matching parent records found.
                      </p>
                    );
                  }

                  return rows.map((reg) => {
                    const usedCount = reg.passes.filter((p) => p.status === 'USED').length;
                    const firstArrival = reg.passes.find((p) => p.usedAt)?.usedAt;
                    const school = getSchoolDisplay(reg);
                    return (
                      <div
                        key={reg.id}
                        className="p-3.5 rounded-xl bg-white border border-[#E3DBD3] flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {reg.parentNumber && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#EDF6F1] text-[#016836] border border-[#016836]/25">
                                {reg.parentNumber}
                              </span>
                            )}
                            <span className="text-sm font-bold text-[#26211E]">{reg.name}</span>
                            {reg.category === 'VIP' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FCF8E3] text-[#8A6D3B] border border-[#8A6D3B]/35">
                                ⭐ VIP
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E6F4FA] text-[#0080BB] border border-[#0080BB]/25">
                              {usedCount} / {reg.passes.length} Arrived
                            </span>
                          </div>
                          <p className="text-xs text-[#7B6E65]">
                            {reg.assignedGate}
                            {reg.phone ? ` • ${reg.phone}` : ''}
                            {reg.email ? ` • ${reg.email}` : ''}
                          </p>
                          {school !== 'Not specified' && (
                            <p className="text-[11px] text-[#7B6E65]">School: {school}</p>
                          )}
                          {firstArrival && (
                            <p className="text-[11px] text-[#016836] font-mono font-semibold">
                              Checked in at {formatTimeOnly(firstArrival)}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            onInspectPasses(reg);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#016836] hover:bg-[#01522B] text-white flex items-center gap-1.5 transition shrink-0"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>View {reg.passes.length} QR</span>
                        </button>
                      </div>
                    );
                  });
                })()}

              {activeModal === 'attendees' &&
                (() => {
                  const rows = metrics.allPasses.filter(({ pass, registration }) => {
                    if (!q) return true;
                    return `${pass.passCode} ${pass.attendeeLabel} ${pass.attendeeContact} ${registration.name} ${registration.parentNumber} ${registration.assignedGate}`
                      .toLowerCase()
                      .includes(q);
                  });
                  if (rows.length === 0) {
                    return (
                      <p className="py-10 text-center text-xs text-[#7B6E65]">
                        No attendee passes match your filter.
                      </p>
                    );
                  }
                  return rows.map(({ pass, registration }) => (
                    <div
                      key={pass.passCode}
                      className="p-3.5 rounded-xl bg-white border border-[#E3DBD3] flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[#016836] bg-[#EDF6F1] px-2 py-0.5 rounded border border-[#016836]/25">
                            {pass.passCode}
                          </span>
                          <span className="text-sm font-bold text-[#26211E]">{pass.attendeeLabel}</span>
                          <span className="text-[11px] text-[#7B6E65]">
                            (Pass {pass.passIndex}/{pass.totalPasses})
                          </span>
                          {pass.attendeeAge && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#F7F4F2] border border-[#E3DBD3] text-[#7B6E65]">
                              Age {pass.attendeeAge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#7B6E65]">
                          Parent: {registration.name}
                          {registration.parentNumber ? ` (${registration.parentNumber})` : ''} •{' '}
                          {registration.assignedGate}
                          {pass.attendeeContact ? ` • ${pass.attendeeContact}` : ''}
                        </p>
                      </div>
                      <div>
                        {pass.status === 'USED' ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#DFF0D8] text-[#016836] border border-[#016836]/25">
                            Arrived • {formatTimeOnly(pass.usedAt)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FCF8E3] text-[#8A6D3B] border border-[#8A6D3B]/30">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  ));
                })()}

              {activeModal === 'alerts' &&
                (() => {
                  const rows = metrics.alertLogs.filter((l) => {
                    if (!q) return true;
                    return `${l.passCode} ${l.attendeeName} ${l.gate} ${l.message} ${l.status}`
                      .toLowerCase()
                      .includes(q);
                  });
                  if (rows.length === 0) {
                    return (
                      <div className="py-10 text-center space-y-2">
                        <AlertTriangle className="w-8 h-8 text-[#016836] mx-auto" />
                        <p className="text-sm font-bold text-[#26211E]">No Gate Scan Alerts</p>
                        <p className="text-xs text-[#7B6E65]">
                          No INVALID or USED (duplicate) QR scans have been recorded yet.
                        </p>
                      </div>
                    );
                  }
                  return rows.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl bg-white border border-[#E53C2E]/35 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              log.status === 'USED'
                                ? 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/35'
                                : 'bg-[#F2DEDE] text-[#E53C2E] border-[#E53C2E]/35'
                            }`}
                          >
                            {log.status}
                          </span>
                          <span className="text-sm font-bold text-[#26211E]">{log.attendeeName}</span>
                          <span className="font-mono text-xs text-[#0080BB]">{log.passCode}</span>
                        </div>
                        <p className="text-xs text-[#7B6E65]">
                          {log.gate} • {log.message}
                          {log.firstUsedAt && (
                            <span className="text-[#8A6D3B] font-semibold ml-1">
                              (First used at {formatTimeOnly(log.firstUsedAt)})
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#26211E]">
                        {formatTimeOnly(log.scannedAt)}
                      </span>
                    </div>
                  ));
                })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

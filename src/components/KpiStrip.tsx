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
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 transition hover:border-indigo-500/60 hover:bg-slate-800/80 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <span>Registered Parents</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-indigo-400 transition" />
            </p>
            <p className="text-2xl font-bold text-white mt-1">{metrics.totalParents}</p>
            <p className="text-[10px] text-indigo-300/80 mt-0.5">Click for details</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 group-hover:scale-105 transition">
            <Users className="w-5 h-5" />
          </div>
        </button>

        {/* 2. Checked In (Arrived) */}
        <button
          type="button"
          onClick={() => openModal('checkedIn')}
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 transition hover:border-emerald-500/60 hover:bg-slate-800/80 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <span>Checked In (Arrived)</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-emerald-400 transition" />
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-bold text-emerald-400">{metrics.arrivedParents.length}</p>
              <span className="text-xs text-emerald-300/80 font-semibold">{metrics.checkInRate}%</span>
            </div>
            <p className="text-[10px] text-emerald-300/80 mt-0.5">Click for details</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition">
            <Check className="w-5 h-5" />
          </div>
        </button>

        {/* 3. Didn't Arrive Yet */}
        <button
          type="button"
          onClick={() => openModal('pending')}
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 transition hover:border-amber-500/60 hover:bg-slate-800/80 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <span>Didn&apos;t Arrive Yet</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-amber-400 transition" />
            </p>
            <p className="text-2xl font-bold text-amber-300 mt-1">{metrics.pendingParents.length}</p>
            <p className="text-[10px] text-amber-300/80 mt-0.5">Click for details</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0 group-hover:scale-105 transition">
            <Hourglass className="w-5 h-5" />
          </div>
        </button>

        {/* 4. Total Attendees (Arrived / Reg) */}
        <button
          type="button"
          onClick={() => openModal('attendees')}
          className="group glass-panel rounded-2xl p-4 text-left flex items-center justify-between gap-2 transition hover:border-sky-500/60 hover:bg-slate-800/80 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-sky-500/50 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <span className="truncate">Total Attendees (Arrived / Reg)</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-sky-400 shrink-0 transition" />
            </p>
            <p className="text-2xl font-bold text-sky-400 mt-1">
              {metrics.arrivedPasses.length} / {metrics.allPasses.length}
            </p>
            <p className="text-[10px] text-sky-300/80 mt-0.5">Click for pass breakdown</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 group-hover:scale-105 transition">
            <Ticket className="w-5 h-5" />
          </div>
        </button>

        {/* 5. Gate Scan Alerts */}
        <button
          type="button"
          onClick={() => openModal('alerts')}
          className="group glass-panel rounded-2xl p-4 col-span-2 lg:col-span-1 text-left flex items-center justify-between gap-2 transition hover:border-rose-500/60 hover:bg-slate-800/80 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-rose-500/50 cursor-pointer"
        >
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <span>Gate Scan Alerts</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-rose-400 transition" />
            </p>
            <p className="text-2xl font-bold text-rose-400 mt-1">{metrics.alertLogs.length}</p>
            <p className="text-[10px] text-rose-300/80 mt-0.5">Invalid &amp; Used scans</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 group-hover:scale-105 transition">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </button>
      </section>

      {/* ==================== CLICKABLE KPI DETAIL MODAL ==================== */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-slate-700/80 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
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
                <p className="text-xs text-slate-400 mt-0.5">
                  Live detailed breakdown • Click any parent row to inspect their QR passes
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Filter details..."
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-2.5">
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
                      <p className="py-10 text-center text-xs text-slate-500">
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
                        className="p-3.5 rounded-xl bg-slate-900/85 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {reg.parentNumber && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                {reg.parentNumber}
                              </span>
                            )}
                            <span className="text-sm font-bold text-white">{reg.name}</span>
                            {reg.category === 'VIP' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                ⭐ VIP
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                              {usedCount} / {reg.passes.length} Arrived
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            {reg.assignedGate}
                            {reg.phone ? ` • ${reg.phone}` : ''}
                            {reg.email ? ` • ${reg.email}` : ''}
                          </p>
                          {school !== 'Not specified' && (
                            <p className="text-[11px] text-slate-400">School: {school}</p>
                          )}
                          {firstArrival && (
                            <p className="text-[11px] text-emerald-300 font-mono">
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
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition shrink-0"
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
                      <p className="py-10 text-center text-xs text-slate-500">
                        No attendee passes match your filter.
                      </p>
                    );
                  }
                  return rows.map(({ pass, registration }) => (
                    <div
                      key={pass.passCode}
                      className="p-3.5 rounded-xl bg-slate-900/85 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                            {pass.passCode}
                          </span>
                          <span className="text-sm font-bold text-white">{pass.attendeeLabel}</span>
                          <span className="text-[11px] text-slate-400">
                            (Pass {pass.passIndex}/{pass.totalPasses})
                          </span>
                          {pass.attendeeAge && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              Age {pass.attendeeAge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          Parent: {registration.name}
                          {registration.parentNumber ? ` (${registration.parentNumber})` : ''} •{' '}
                          {registration.assignedGate}
                          {pass.attendeeContact ? ` • ${pass.attendeeContact}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {pass.status === 'USED' ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Arrived • {formatTimeOnly(pass.usedAt)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
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
                        <AlertTriangle className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="text-sm font-semibold text-white">No Gate Scan Alerts</p>
                        <p className="text-xs text-slate-400">
                          No INVALID or USED (duplicate) QR scans have been recorded yet.
                        </p>
                      </div>
                    );
                  }
                  return rows.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl bg-slate-900/85 border border-rose-500/25 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              log.status === 'USED'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {log.status}
                          </span>
                          <span className="text-sm font-bold text-white">{log.attendeeName}</span>
                          <span className="font-mono text-xs text-sky-300">{log.passCode}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {log.gate} • {log.message}
                          {log.firstUsedAt && (
                            <span className="text-amber-300 ml-1">
                              (First used at {formatTimeOnly(log.firstUsedAt)})
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-300">
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

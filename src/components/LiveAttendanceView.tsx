import React, { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { Download, QrCode, RotateCcw, Trash2 } from 'lucide-react';
import { formatTimeOnly, getRegistrationStatus, getSchoolDisplay } from '../lib/qr';
import type { Registration, Venue } from '../types';

interface LiveAttendanceViewProps {
  venues: Venue[];
  registrations: Registration[];
  readOnly: boolean;
  onInspectPasses: (reg: Registration) => void;
  onDeleteRegistration?: (regId: string) => void;
  onResetDemo?: () => void;
}

export const LiveAttendanceView: React.FC<LiveAttendanceViewProps> = ({
  venues,
  registrations,
  readOnly,
  onInspectPasses,
  onDeleteRegistration,
  onResetDemo,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CHECKED_IN' | 'PARTIAL' | 'PENDING'>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'VIP' | 'Regular Parent'>('ALL');
  const [gateFilter, setGateFilter] = useState<string>('ALL');

  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  const gateStats = useMemo(() => {
    return venues.map((venue) => {
      const assigned = registrations.filter((r) => r.assignedGate === venue.name);
      const arrivedParents = assigned.filter((r) => getRegistrationStatus(r) !== 'PENDING');
      const pendingParents = assigned.length - arrivedParents.length;
      const arrivedPasses = assigned.reduce(
        (sum, r) => sum + r.passes.filter((p) => p.status === 'USED').length,
        0
      );
      const totalPasses = assigned.reduce((sum, r) => sum + (r.passes.length || r.partySize), 0);
      const pct = assigned.length > 0 ? Math.min(100, Math.round((arrivedParents.length / assigned.length) * 100)) : 0;

      return {
        venue,
        assignedCount: assigned.length,
        checkedInCount: arrivedParents.length,
        pendingCount: pendingParents,
        arrivedPasses,
        totalPasses,
        pct,
      };
    });
  }, [registrations, venues]);

  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;

    const labels = gateStats.map((s) => s.venue.name.split(' - ')[0]);
    const checkedInData = gateStats.map((s) => s.checkedInCount);
    const pendingData = gateStats.map((s) => s.pendingCount);

    if (chartInstanceRef.current) {
      chartInstanceRef.current.data.labels = labels;
      chartInstanceRef.current.data.datasets[0].data = checkedInData;
      chartInstanceRef.current.data.datasets[1].data = pendingData;
      chartInstanceRef.current.update();
      return;
    }

    chartInstanceRef.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Checked In',
            data: checkedInData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6,
          },
          {
            label: "Didn't Arrive Yet",
            data: pendingData,
            backgroundColor: 'rgba(245, 158, 11, 0.55)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#cbd5e1', font: { size: 11 } },
          },
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8', font: { size: 11 } },
            grid: { color: 'rgba(148, 163, 184, 0.08)' },
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: '#94a3b8', font: { size: 11 } },
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
          },
        },
      },
    });

    return () => {
      chartInstanceRef.current?.destroy();
      chartInstanceRef.current = null;
    };
  }, [gateStats]);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registrations.filter((r) => {
      const st = getRegistrationStatus(r);
      if (statusFilter === 'CHECKED_IN' && st === 'PENDING') return false;
      if (statusFilter === 'PARTIAL' && st !== 'PARTIAL') return false;
      if (statusFilter === 'PENDING' && st !== 'PENDING') return false;
      if (tierFilter !== 'ALL' && r.category !== tierFilter) return false;
      if (gateFilter !== 'ALL' && r.assignedGate !== gateFilter) return false;
      if (q) {
        const hay = `${r.parentNumber} ${r.id} ${r.name} ${r.phone} ${r.email} ${r.category} ${r.assignedGate} ${getSchoolDisplay(r)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [gateFilter, registrations, search, statusFilter, tierFilter]);

  const exportAttendanceCsv = () => {
    const headers = [
      'ParentNumber',
      'TicketID',
      'ParentName',
      'Tier',
      'Phone',
      'Email',
      'School',
      'AttendeesArrived',
      'TotalAttendees',
      'AssignedVenue',
      'ArrivalStatus',
      'FirstScanTime',
    ];
    const rows = filteredRoster.map((r) => {
      const usedCount = r.passes.filter((p) => p.status === 'USED').length;
      const firstTime = r.passes.find((p) => p.usedAt)?.usedAt || '';
      const statusText =
        usedCount === 0
          ? "Didn't Arrive Yet"
          : usedCount >= r.passes.length
          ? 'Checked In'
          : `Partially Arrived (${usedCount}/${r.passes.length})`;
      return [
        `"${r.parentNumber}"`,
        r.id,
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.category}"`,
        `"${r.phone}"`,
        `"${r.email}"`,
        `"${getSchoolDisplay(r).replace(/"/g, '""')}"`,
        usedCount,
        r.passes.length,
        `"${r.assignedGate.replace(/"/g, '""')}"`,
        `"${statusText}"`,
        `"${formatTimeOnly(firstTime)}"`,
      ].join(',');
    });
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sabis_parent_attendance_report.csv';
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Venue Access Points Distribution + Chart (NO max capacity displayed!) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">
                Venue Access Points — Parent Check-In Distribution
              </h2>
              <p className="text-xs text-slate-400">
                Live count of parents &amp; total attendees checked in vs. didn&apos;t arrive yet at each venue
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              Auto-Synced
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {gateStats.map((st) => (
              <div
                key={st.venue.id}
                className="p-4 rounded-xl bg-slate-900/85 border border-slate-800 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-white">{st.venue.name}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      <span className="text-emerald-300 font-semibold">
                        {st.checkedInCount} Checked In ({st.arrivedPasses}/{st.totalPasses} passes)
                      </span>{' '}
                      •{' '}
                      <span className="text-amber-300 font-semibold">
                        {st.pendingCount} Didn&apos;t Arrive Yet
                      </span>
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">
                    {st.pct}% arrived
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${st.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 glass-panel rounded-2xl p-5 flex flex-col justify-between">
          <div className="mb-3">
            <h2 className="text-base font-bold text-white">Checked In vs. Didn&apos;t Arrive Yet</h2>
            <p className="text-xs text-slate-400">Real-time parent turnout across venues</p>
          </div>
          <div className="relative h-64 w-full">
            <canvas ref={chartCanvasRef} />
          </div>
        </div>
      </div>

      {/* Registered Parents Master List */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              Registered Parents Master List (VIP &amp; Regular Parents)
            </h2>
            <p className="text-xs text-slate-400">
              {readOnly
                ? 'View-only live roster showing Parent #, Name, School, Contact, Attendees, Venue, and arrival status'
                : 'Manage registered parents, inspect multi-attendee QR passes, and export live attendance'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportAttendanceCsv}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Attendance CSV</span>
            </button>
            {!readOnly && onResetDemo && (
              <button
                type="button"
                onClick={onResetDemo}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo Roster</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Parent #, Name, School, Phone..."
            className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="CHECKED_IN">✅ Checked In (Arrived)</option>
            <option value="PARTIAL">🟡 Partially Arrived</option>
            <option value="PENDING">⏳ Didn&apos;t Arrive Yet</option>
          </select>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Tiers (VIP &amp; Regular)</option>
            <option value="VIP">⭐ VIP Only</option>
            <option value="Regular Parent">Regular Parents Only</option>
          </select>
          <select
            value={gateFilter}
            onChange={(e) => setGateFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/95 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <th className="py-3 px-4">Parent # / ID</th>
                <th className="py-3 px-4">Parent Name &amp; School</th>
                <th className="py-3 px-4">Contact &amp; Attendees</th>
                <th className="py-3 px-4">Assigned Venue</th>
                <th className="py-3 px-4">Arrival Status</th>
                <th className="py-3 px-4 text-right">QR Passes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                    No matching registered parents found for the current filters.
                  </td>
                </tr>
              ) : (
                filteredRoster.map((reg) => {
                  const usedCount = reg.passes.filter((p) => p.status === 'USED').length;
                  const firstTime = reg.passes.find((p) => p.usedAt)?.usedAt;
                  const status = getRegistrationStatus(reg);
                  const school = getSchoolDisplay(reg);

                  return (
                    <tr key={reg.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                          {reg.parentNumber || reg.id}
                        </span>
                        <span className="block text-[10px] font-mono text-slate-500 mt-0.5">{reg.id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-white">{reg.name}</span>
                          {reg.category === 'VIP' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ⭐ VIP
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                              Regular
                            </span>
                          )}
                        </div>
                        {school !== 'Not specified' && (
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs" title={school}>
                            {school}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs text-slate-200">{reg.phone || '—'}</div>
                        {reg.email && <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{reg.email}</div>}
                        <div className="text-[11px] text-sky-300 font-semibold mt-0.5">
                          {usedCount}/{reg.passes.length} QR {reg.passes.length === 1 ? 'Pass' : 'Passes'} Arrived
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-300">{reg.assignedGate}</td>
                      <td className="py-3 px-4">
                        {status === 'CHECKED_IN' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ✅ Checked In • {formatTimeOnly(firstTime)}
                          </span>
                        )}
                        {status === 'PARTIAL' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            🟡 {usedCount}/{reg.passes.length} Arrived • {formatTimeOnly(firstTime)}
                          </span>
                        )}
                        {status === 'PENDING' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            ⏳ Didn&apos;t Arrive Yet
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => onInspectPasses(reg)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>{reg.passes.length} QR</span>
                        </button>
                        {!readOnly && onDeleteRegistration && (
                          <button
                            type="button"
                            onClick={() => onDeleteRegistration(reg.id)}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 transition align-middle"
                            title="Remove Registration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

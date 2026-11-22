import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, Search, Trash2, XCircle } from 'lucide-react';
import { formatDateTime, formatTimeOnly } from '../lib/qr';
import type { ScanLog, ScanOutcome } from '../types';

interface EventLogsPanelProps {
  logs: ScanLog[];
  canClear?: boolean;
  onClear?: () => void;
  compact?: boolean;
}

export const EventLogsPanel: React.FC<EventLogsPanelProps> = ({
  logs,
  canClear = false,
  onClear,
  compact = false,
}) => {
  const [filter, setFilter] = useState<'ALL' | ScanOutcome>('ALL');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    let valid = 0;
    let used = 0;
    let invalid = 0;
    for (const l of logs) {
      if (l.status === 'VALID') valid++;
      else if (l.status === 'USED') used++;
      else invalid++;
    }
    return { valid, used, invalid, total: logs.length };
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (filter !== 'ALL' && l.status !== filter) return false;
      if (!q) return true;
      const hay = `${l.passCode} ${l.parentNumber} ${l.attendeeName} ${l.gate} ${l.message} ${l.scannedBy} ${l.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter, logs, search]);

  const exportCsv = () => {
    const headers = ['Timestamp', 'Status', 'PassCode', 'ParentNumber', 'Attendee', 'Tier', 'VenueGate', 'Details', 'FirstUsedAt', 'ScannedBy'];
    const rows = filtered.map((l) =>
      [
        `"${formatDateTime(l.scannedAt)}"`,
        l.status,
        `"${l.passCode}"`,
        `"${l.parentNumber}"`,
        `"${l.attendeeName.replace(/"/g, '""')}"`,
        `"${l.tier}"`,
        `"${l.gate.replace(/"/g, '""')}"`,
        `"${l.message.replace(/"/g, '""')}"`,
        l.firstUsedAt ? `"${formatDateTime(l.firstUsedAt)}"` : '""',
        `"${l.scannedBy}"`,
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sabis_event_scan_logs.csv';
    link.click();
  };

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3DBD3] pb-3.5">
        <div>
          <h2 className="text-base font-bold text-[#26211E] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#016836]" />
            <span>Event Gate Scan Logs (Valid / Used / Invalid)</span>
          </h2>
          <p className="text-xs text-[#7B6E65] mt-0.5">
            Real-time timing audit trail visible to all authenticated users
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F7F4F2] hover:bg-[#E3DBD3]/60 text-[#26211E] border border-[#E3DBD3] flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5 text-[#016836]" />
            <span>Export Logs</span>
          </button>
          {canClear && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F2DEDE] hover:bg-[#E53C2E] hover:text-white text-[#E53C2E] border border-[#E53C2E]/30 flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Logs</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              filter === 'ALL'
                ? 'bg-[#016836] text-white border-[#016836]'
                : 'bg-[#F7F4F2] text-[#7B6E65] border-[#E3DBD3] hover:text-[#26211E]'
            }`}
          >
            All ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setFilter('VALID')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 transition ${
              filter === 'VALID'
                ? 'bg-[#016836] text-white border-[#016836]'
                : 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25 hover:bg-[#016836]/15'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Valid ({counts.valid})
          </button>
          <button
            type="button"
            onClick={() => setFilter('USED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 transition ${
              filter === 'USED'
                ? 'bg-[#8A6D3B] text-white border-[#8A6D3B]'
                : 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/30 hover:bg-[#8A6D3B]/15'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Used ({counts.used})
          </button>
          <button
            type="button"
            onClick={() => setFilter('INVALID')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 transition ${
              filter === 'INVALID'
                ? 'bg-[#E53C2E] text-white border-[#E53C2E]'
                : 'bg-[#F2DEDE] text-[#E53C2E] border-[#E53C2E]/30 hover:bg-[#E53C2E]/15'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Invalid ({counts.invalid})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#7B6E65] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pass, parent #, gate..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-[#B6ADA4] text-xs text-[#26211E] placeholder-[#7B6E65] focus:outline-none focus:border-[#016836]"
          />
        </div>
      </div>

      {/* Log entries */}
      {filtered.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#7B6E65] border border-dashed border-[#E3DBD3] rounded-xl bg-[#F7F4F2]/50">
          No scan log entries match the selected filter.
        </div>
      ) : (
        <div className={`space-y-2 overflow-y-auto pr-1 ${compact ? 'max-h-96' : 'max-h-[540px]'}`}>
          {filtered.map((log) => {
            const badgeStyle =
              log.status === 'VALID'
                ? 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                : log.status === 'USED'
                ? 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/35'
                : 'bg-[#F2DEDE] text-[#E53C2E] border-[#E53C2E]/35';

            return (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-[#F7F4F2]/75 border border-[#E3DBD3] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badgeStyle}`}>
                      {log.status}
                    </span>
                    {log.tier === 'VIP' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FCF8E3] text-[#8A6D3B] border border-[#8A6D3B]/35">
                        ⭐ VIP
                      </span>
                    )}
                    <span className="text-xs sm:text-sm font-bold text-[#26211E] truncate">
                      {log.attendeeName}
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-[#0080BB] bg-[#E6F4FA] px-1.5 py-0.5 rounded border border-[#0080BB]/25">
                      {log.passCode || log.parentNumber}
                    </span>
                  </div>
                  <p className="text-xs text-[#7B6E65]">
                    <span className="text-[#26211E] font-medium">{log.gate}</span> • {log.message}
                    {log.status === 'USED' && log.firstUsedAt && (
                      <span className="text-[#8A6D3B] font-mono font-semibold ml-1.5">
                        (First used: {formatTimeOnly(log.firstUsedAt)})
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <div className="text-xs font-mono font-bold text-[#26211E]">
                    {formatTimeOnly(log.scannedAt)}
                  </div>
                  <div className="text-[10px] text-[#7B6E65] font-mono">
                    {formatDateTime(log.scannedAt).split(' ').slice(0, 3).join(' ')}
                    {log.scannedBy ? ` • ${log.scannedBy}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

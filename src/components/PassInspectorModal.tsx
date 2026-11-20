import React, { useState } from 'react';
import { Copy, Download, Mail, Printer, X, CheckCircle2, Clock } from 'lucide-react';
import { buildPassQrPayload, downloadPassPng, formatTimeOnly, getSchoolDisplay } from '../lib/qr';
import { useEvent } from '../context/EventContext';
import type { Registration } from '../types';
import { QrCodeImage } from './QrCodeImage';

interface PassInspectorModalProps {
  registration: Registration | null;
  onClose: () => void;
}

export const PassInspectorModal: React.FC<PassInspectorModalProps> = ({ registration, onClose }) => {
  const { settings, showToast, resendQrPasses } = useEvent();
  const [resending, setResending] = useState(false);

  if (!registration) return null;

  const isVip = registration.category === 'VIP';
  const schoolText = getSchoolDisplay(registration);

  const handleCopyPayload = async (passIndex: number) => {
    const pass = registration.passes[passIndex];
    if (!pass) return;
    try {
      await navigator.clipboard.writeText(buildPassQrPayload(registration, pass));
      showToast(`Copied QR payload for ${pass.passCode}`, 'success');
    } catch {
      showToast(`Pass code: ${pass.passCode}`, 'info');
    }
  };

  const handleResend = async () => {
    setResending(true);
    const res = await resendQrPasses(registration);
    setResending(false);
    showToast(res.message, res.ok ? 'success' : 'warning');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-panel rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-white">{registration.name}</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                  isVip
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                }`}
              >
                {isVip ? '⭐ VIP' : 'Regular Parent'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                {registration.passes.length} QR {registration.passes.length === 1 ? 'Pass' : 'Passes'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {registration.parentNumber ? `Parent #: ${registration.parentNumber} • ` : ''}
              {registration.assignedGate}
              {schoolText !== 'Not specified' ? ` • ${schoolText}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(registration.email || registration.phone) && (
              <button
                type="button"
                disabled={resending}
                onClick={handleResend}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{resending ? 'Sending...' : 'Send to Contact'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print All</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Passes Grid */}
        <div className="p-5 overflow-y-auto printable-pass-area">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {registration.passes.map((pass, idx) => {
              const isUsed = pass.status === 'USED';
              return (
                <div
                  key={pass.passCode}
                  className={`${
                    isVip ? 'vip-pass-gradient border-amber-500/40' : 'pass-gradient border-indigo-500/30'
                  } rounded-2xl p-4 border shadow-lg flex flex-col justify-between gap-3`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-700/70 pb-2.5">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                        Pass {pass.passIndex} of {pass.totalPasses}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">
                        {pass.attendeeLabel || registration.name}
                      </h4>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-2">
                        {pass.attendeeAge && <span>Age: {pass.attendeeAge}</span>}
                        {pass.attendeeContact && <span>Contact: {pass.attendeeContact}</span>}
                      </div>
                    </div>
                    {isUsed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> USED {formatTimeOnly(pass.usedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                        <Clock className="w-3 h-3" /> VALID / UNUSED
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-center py-1">
                    <div className="bg-white p-3 rounded-2xl shadow-md border-4 border-indigo-500/20">
                      <QrCodeImage payload={buildPassQrPayload(registration, pass)} size={172} />
                    </div>
                    <p className="mt-2 font-mono text-xs font-bold tracking-wider text-sky-300 bg-slate-900/90 px-3 py-1 rounded-md border border-slate-700">
                      {pass.passCode}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 print:hidden">
                    <button
                      type="button"
                      onClick={() => downloadPassPng(registration, pass, settings.eventTitle)}
                      className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save PNG</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyPayload(idx)}
                      className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy QR</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

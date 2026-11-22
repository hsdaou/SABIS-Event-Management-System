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
    <div className="fixed inset-0 z-50 bg-[#26211E]/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-[#E3DBD3] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E3DBD3] bg-[#F7F4F2] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-[#26211E]">{registration.name}</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                  isVip
                    ? 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/35'
                    : 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                }`}
              >
                {isVip ? '⭐ VIP' : 'Regular Parent'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F4FA] text-[#0080BB] border border-[#0080BB]/25">
                {registration.passes.length} SABIS® QR {registration.passes.length === 1 ? 'Pass' : 'Passes'}
              </span>
            </div>
            <p className="text-xs text-[#7B6E65] mt-1">
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
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#E6F4FA] hover:bg-[#0080BB] hover:text-white text-[#0080BB] border border-[#0080BB]/30 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{resending ? 'Sending...' : 'Send to Contact'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-[#E3DBD3]/50 text-[#26211E] border border-[#E3DBD3] flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print All</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#7B6E65] hover:text-[#26211E] hover:bg-[#E3DBD3]/50 transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Passes Grid */}
        <div className="p-5 overflow-y-auto printable-pass-area bg-[#F7F4F2]/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {registration.passes.map((pass, idx) => {
              const isUsed = pass.status === 'USED';
              return (
                <div
                  key={pass.passCode}
                  className={`${
                    isVip
                      ? 'vip-pass-gradient border-[#8A6D3B]/40 border-t-4 border-t-[#8A6D3B]'
                      : 'pass-gradient border-[#E3DBD3] border-t-4 border-t-[#016836]'
                  } rounded-2xl p-4 border shadow-sm flex flex-col justify-between gap-3`}
                >
                  <div className="flex items-center justify-between border-b border-[#E3DBD3] pb-2.5">
                    <img src="/sabis-logo.svg" alt="SABIS®" className="h-6 w-auto" />
                    {isUsed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#DFF0D8] text-[#016836] border border-[#016836]/25 shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> USED {formatTimeOnly(pass.usedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FCF8E3] text-[#8A6D3B] border border-[#8A6D3B]/35 shrink-0">
                        <Clock className="w-3 h-3" /> VALID / UNUSED
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#016836]">
                      Pass {pass.passIndex} of {pass.totalPasses}
                    </span>
                    <h4 className="text-sm font-bold text-[#26211E] mt-0.5">
                      {pass.attendeeLabel || registration.name}
                    </h4>
                    <div className="text-[11px] text-[#7B6E65] mt-0.5 flex flex-wrap gap-2">
                      {pass.attendeeAge && <span>Age: {pass.attendeeAge}</span>}
                      {pass.attendeeContact && <span>Contact: {pass.attendeeContact}</span>}
                    </div>
                  </div>

                  <div className="flex flex-col items-center py-1">
                    <div
                      className={`bg-white p-3 rounded-2xl shadow-sm border-2 ${
                        isVip ? 'border-[#8A6D3B]/40' : 'border-[#016836]/30'
                      }`}
                    >
                      <QrCodeImage payload={buildPassQrPayload(registration, pass)} size={180} />
                    </div>
                    <p className="mt-2 font-mono text-xs font-bold tracking-wider text-[#016836] bg-white px-3 py-1 rounded-md border border-[#E3DBD3]">
                      {pass.passCode}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 print:hidden">
                    <button
                      type="button"
                      onClick={() => downloadPassPng(registration, pass, settings.eventTitle)}
                      className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-[#016836] hover:bg-[#01522B] text-white flex items-center justify-center gap-1.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save PNG</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyPayload(idx)}
                      className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#F7F4F2] text-[#26211E] border border-[#E3DBD3] flex items-center justify-center gap-1.5 transition"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#016836]" />
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

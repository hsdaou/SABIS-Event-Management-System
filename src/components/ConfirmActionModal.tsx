import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmActionConfig {
  title: string;
  description: string;
  targetLabel?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmActionModalProps {
  config: ConfirmActionConfig | null;
  onClose: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({ config, onClose }) => {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, config, onClose]);

  if (!config) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await config.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#26211E]/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 border border-[#E3DBD3] border-t-4 border-t-[#E53C2E] shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F2DEDE] border border-[#E53C2E]/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-[#E53C2E]" />
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-base font-bold text-[#26211E]">
                {config.title}
              </h3>
              <p className="text-xs text-[#7B6E65] mt-1 leading-relaxed">{config.description}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-1 rounded-lg text-[#7B6E65] hover:bg-[#F7F4F2] disabled:opacity-40"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {config.targetLabel && (
          <div className="px-3.5 py-2.5 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3] text-xs font-bold text-[#26211E] break-words">
            {config.targetLabel}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E3DBD3]">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#F7F4F2] hover:bg-[#E3DBD3]/70 text-[#26211E] border border-[#E3DBD3] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#E53C2E] hover:bg-[#C9302C] text-white shadow-sm transition disabled:opacity-50"
          >
            {busy ? 'Processing...' : config.confirmLabel || 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

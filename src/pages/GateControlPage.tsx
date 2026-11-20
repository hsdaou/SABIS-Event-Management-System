import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Keyboard,
  QrCode,
  StopCircle,
  XCircle,
} from 'lucide-react';
import { EventLogsPanel } from '../components/EventLogsPanel';
import { TopBar } from '../components/TopBar';
import { useEvent, type ScanResult } from '../context/EventContext';
import { buildPassQrPayload, formatTimeOnly, getSchoolDisplay } from '../lib/qr';

type MobileTab = 'scanner' | 'logs';
type InputMode = 'camera' | 'image' | 'manual';

export const GateControlPage: React.FC = () => {
  const { venues, registrations, scanLogs, scanQrCode, showToast } = useEvent();

  const [mobileTab, setMobileTab] = useState<MobileTab>('scanner');
  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [activeGate, setActiveGate] = useState(venues[0]?.name || 'Gate A - Main Campus Entrance');
  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('Tap "Start Camera Scanner" to scan attendee QR codes.');
  const [manualCode, setManualCode] = useState('');
  const [selectedSimPass, setSelectedSimPass] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const activeGateRef = useRef(activeGate);

  useEffect(() => {
    activeGateRef.current = activeGate;
  }, [activeGate]);

  const stopCamera = async () => {
    if (scannerRef.current && cameraRunning) {
      try {
        await scannerRef.current.stop();
      } catch {
        // ignore
      }
      setCameraRunning(false);
      setCameraStatus('Camera stopped.');
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleDecodedScan = async (raw: string) => {
    const now = Date.now();
    // Prevent rapid accidental double-scans within 2.5s of the exact same frame
    if (lastDecodedRef.current.code === raw && now - lastDecodedRef.current.ts < 2500) {
      return;
    }
    lastDecodedRef.current = { code: raw, ts: now };
    const result = await scanQrCode(raw, activeGateRef.current);
    setLastResult(result);
  };

  const startCamera = async () => {
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('mobileQrReader');
      }
      setCameraStatus('Requesting rear camera permission...');
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleDecodedScan(decodedText);
        },
        () => {}
      );
      setCameraRunning(true);
      setCameraStatus('Live camera active — hold QR pass steady inside the frame.');
    } catch {
      setCameraStatus('Camera unavailable on this device/browser — switched to Manual / Quick Scan.');
      showToast('Camera unavailable; switched to Manual / Quick Scan mode.', 'warning');
      setInputMode('manual');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const temp = new Html5Qrcode('mobileQrImageDecoder');
      const decoded = await temp.scanFile(file, false);
      await handleDecodedScan(decoded);
    } catch {
      const match = file.name.match(/EVT-\d{4}-\d+(?:-\d+)?|PAR-\d+/i);
      if (match) {
        await handleDecodedScan(match[0].toUpperCase());
      } else {
        const res = await scanQrCode('UNREADABLE_QR_IMAGE', activeGate);
        setLastResult(res);
      }
    }
    e.target.value = '';
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const result = await scanQrCode(manualCode.trim(), activeGate);
    setLastResult(result);
    setManualCode('');
  };

  const allPasses = registrations.flatMap((r) =>
    r.passes.map((p) => ({ reg: r, pass: p }))
  );

  const simulateSelected = async () => {
    const targetCode = selectedSimPass || allPasses[0]?.pass.passCode;
    if (!targetCode) return;
    const found = allPasses.find((x) => x.pass.passCode === targetCode);
    const payload = found ? buildPassQrPayload(found.reg, found.pass) : targetCode;
    const res = await scanQrCode(payload, activeGate);
    setLastResult(res);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <TopBar />

      <main className="max-w-3xl mx-auto w-full px-4 py-5 space-y-5 flex-1">
        {/* Mobile Gate Control Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setMobileTab('scanner')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
              mobileTab === 'scanner'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Gate QR Scanner</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (cameraRunning) stopCamera();
              setMobileTab('logs');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
              mobileTab === 'logs'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Event Logs ({scanLogs.length})</span>
          </button>
        </div>

        {mobileTab === 'scanner' ? (
          <div className="space-y-5">
            {/* Active Venue Selector */}
            <div className="glass-panel rounded-2xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Active Venue Gate
                </label>
                <select
                  value={activeGate}
                  onChange={(e) => setActiveGate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500"
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Input Method Switcher */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setInputMode('camera')}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    inputMode === 'camera'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (cameraRunning) stopCamera();
                    setInputMode('image');
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    inputMode === 'image'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (cameraRunning) stopCamera();
                    setInputMode('manual');
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    inputMode === 'manual'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Manual</span>
                </button>
              </div>

              {/* Camera Mode */}
              {inputMode === 'camera' && (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 min-h-[250px] flex flex-col items-center justify-center p-4">
                    <div id="mobileQrReader" className="w-full max-w-sm mx-auto" />
                    {cameraRunning && (
                      <div className="absolute inset-x-8 top-4 pointer-events-none">
                        <div className="scan-laser w-full" />
                      </div>
                    )}
                    {!cameraRunning && (
                      <div className="text-center space-y-3 py-5">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                          <Camera className="w-6 h-6 text-emerald-400" />
                        </div>
                        <p className="text-sm font-bold text-white">Mobile Gate QR Camera</p>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto">
                          Scan each attendee&apos;s individual QR code to verify VALID, USED, or INVALID status immediately.
                        </p>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 transition"
                        >
                          Start Camera Scanner
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{cameraStatus}</span>
                    {cameraRunning && (
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1"
                      >
                        <StopCircle className="w-3.5 h-3.5" /> Stop
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Image Upload Mode */}
              {inputMode === 'image' && (
                <div className="rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/60 p-6 text-center space-y-3">
                  <div id="mobileQrImageDecoder" className="hidden" />
                  <ImageIcon className="w-8 h-8 text-indigo-400 mx-auto" />
                  <p className="text-sm font-semibold text-white">Upload QR Pass Screenshot / Image</p>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition">
                    <span>Choose QR Image File</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              )}

              {/* Manual Entry & Quick Test */}
              {inputMode === 'manual' && (
                <div className="space-y-4">
                  <form onSubmit={handleManualSubmit} className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      Enter Pass Code (e.g., EVT-2026-1004-1) or Parent #
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="EVT-2026-1004-1 or PAR-11530"
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition"
                      >
                        Verify
                      </button>
                    </div>
                  </form>

                  <div className="pt-3 border-t border-slate-800 space-y-2.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Quick Pass Test (Select Registered Pass)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={selectedSimPass}
                        onChange={(e) => setSelectedSimPass(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                      >
                        {allPasses.map(({ reg, pass }) => (
                          <option key={pass.passCode} value={pass.passCode}>
                            [{pass.status === 'USED' ? 'USED' : 'VALID'}] {pass.passCode} —{' '}
                            {pass.attendeeLabel} ({pass.passIndex}/{pass.totalPasses})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={simulateSelected}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
                      >
                        Scan Pass
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await scanQrCode('FAKE-PASS-9999', activeGate);
                        setLastResult(res);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
                    >
                      Test Invalid QR Code
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Instant High-Contrast Scan Verdict Banner (VALID / USED / INVALID) */}
            {lastResult && (
              <div
                className={`glass-panel rounded-2xl p-5 border-2 transition-all space-y-4 ${
                  lastResult.status === 'VALID'
                    ? 'border-emerald-500 bg-emerald-950/30'
                    : lastResult.status === 'USED'
                    ? 'border-amber-500 bg-amber-950/30'
                    : 'border-rose-500 bg-rose-950/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        lastResult.status === 'VALID'
                          ? 'bg-emerald-500 text-slate-950'
                          : lastResult.status === 'USED'
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-rose-500 text-white'
                      }`}
                    >
                      {lastResult.status === 'VALID' && <CheckCircle2 className="w-7 h-7" />}
                      {lastResult.status === 'USED' && <AlertTriangle className="w-7 h-7" />}
                      {lastResult.status === 'INVALID' && <XCircle className="w-7 h-7" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                            lastResult.status === 'VALID'
                              ? 'bg-emerald-500 text-slate-950'
                              : lastResult.status === 'USED'
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-rose-500 text-white'
                          }`}
                        >
                          {lastResult.status}
                        </span>
                        <span className="text-xs font-mono text-slate-300">
                          Scanned at {formatTimeOnly(lastResult.scannedAt)}
                        </span>
                      </div>
                      <h3 className="text-lg font-extrabold text-white mt-1">
                        {lastResult.headline}
                      </h3>
                      <p className="text-xs text-slate-200 mt-0.5">{lastResult.subtext}</p>
                      {lastResult.status === 'USED' && lastResult.firstUsedAt && (
                        <p className="text-xs font-mono font-bold text-amber-300 mt-1">
                          Previously Used At: {formatTimeOnly(lastResult.firstUsedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {lastResult.registration && lastResult.pass && (
                  <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-950/70 rounded-xl p-3.5 border border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Attendee &amp; Pass</span>
                      <span className="font-bold text-white">
                        {lastResult.pass.attendeeLabel} ({lastResult.pass.passIndex}/
                        {lastResult.pass.totalPasses})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Pass Code</span>
                      <span className="font-mono font-bold text-sky-300">
                        {lastResult.pass.passCode}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Tier &amp; Parent #</span>
                      <span className="font-semibold text-slate-200">
                        {lastResult.registration.category} •{' '}
                        {lastResult.registration.parentNumber || lastResult.registration.id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">School</span>
                      <span className="font-semibold text-slate-200 truncate block">
                        {getSchoolDisplay(lastResult.registration)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recent Timing Logs Preview */}
            <EventLogsPanel logs={scanLogs} canClear={false} compact={true} />
          </div>
        ) : (
          <EventLogsPanel logs={scanLogs} canClear={false} />
        )}
      </main>
    </div>
  );
};

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
  const { activeEvent, venues, registrations, scanLogs, scanQrCode, showToast } = useEvent();

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
    if (venues.length > 0 && !venues.some((v) => v.name === activeGate)) {
      setActiveGate(venues[0].name);
    }
  }, [activeGate, venues]);

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
      setCameraStatus('Live camera active — hold SABIS® QR pass steady inside the frame.');
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
    <div className="min-h-screen flex flex-col bg-[#F7F4F2]">
      <TopBar />

      <main className="max-w-3xl mx-auto w-full px-4 py-5 space-y-5 flex-1">
        <div className="text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#016836]">
            {activeEvent.name}
          </span>
          <h2 className="text-lg font-bold text-[#26211E]">Mobile Gate Control Terminal</h2>
        </div>

        {/* Mobile Gate Control Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-white p-1.5 rounded-2xl border border-[#E3DBD3] shadow-sm">
          <button
            type="button"
            onClick={() => setMobileTab('scanner')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
              mobileTab === 'scanner'
                ? 'bg-[#016836] text-white shadow-sm'
                : 'text-[#7B6E65] hover:text-[#26211E]'
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
                ? 'bg-[#0080BB] text-white shadow-sm'
                : 'text-[#7B6E65] hover:text-[#26211E]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Event Logs ({scanLogs.length})</span>
          </button>
        </div>

        {mobileTab === 'scanner' ? (
          <div className="space-y-5">
            {/* Active Venue Selector */}
            <div className="glass-panel rounded-2xl p-4 sm:p-5 border-t-4 border-t-[#016836] space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                  Active Venue Gate
                </label>
                <select
                  value={activeGate}
                  onChange={(e) => setActiveGate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm font-bold text-[#26211E] focus:outline-none focus:border-[#016836]"
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Input Method Switcher */}
              <div className="grid grid-cols-3 gap-1.5 bg-[#F7F4F2] p-1 rounded-xl border border-[#E3DBD3]">
                <button
                  type="button"
                  onClick={() => setInputMode('camera')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    inputMode === 'camera'
                      ? 'bg-[#016836] text-white'
                      : 'text-[#7B6E65] hover:text-[#26211E]'
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
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    inputMode === 'image'
                      ? 'bg-[#016836] text-white'
                      : 'text-[#7B6E65] hover:text-[#26211E]'
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
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    inputMode === 'manual'
                      ? 'bg-[#016836] text-white'
                      : 'text-[#7B6E65] hover:text-[#26211E]'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Manual</span>
                </button>
              </div>

              {/* Camera Mode */}
              {inputMode === 'camera' && (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-[#26211E] border border-[#E3DBD3] min-h-[250px] flex flex-col items-center justify-center p-4">
                    <div id="mobileQrReader" className="w-full max-w-sm mx-auto" />
                    {cameraRunning && (
                      <div className="absolute inset-x-8 top-4 pointer-events-none">
                        <div className="scan-laser w-full" />
                      </div>
                    )}
                    {!cameraRunning && (
                      <div className="text-center space-y-3 py-5">
                        <div className="w-12 h-12 rounded-2xl bg-[#016836]/25 border border-[#016836] flex items-center justify-center mx-auto">
                          <Camera className="w-6 h-6 text-[#DFF0D8]" />
                        </div>
                        <p className="text-sm font-bold text-white">SABIS® Mobile Gate QR Camera</p>
                        <p className="text-xs text-[#E3DBD3] max-w-xs mx-auto">
                          Scan each attendee&apos;s individual SABIS® QR code to verify VALID, USED, or INVALID status immediately.
                        </p>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#046937] text-white shadow-lg transition"
                        >
                          Start Camera Scanner
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#7B6E65]">
                    <span>{cameraStatus}</span>
                    {cameraRunning && (
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-3 py-1 rounded-lg bg-[#F2DEDE] text-[#E53C2E] border border-[#E53C2E]/30 flex items-center gap-1 font-semibold"
                      >
                        <StopCircle className="w-3.5 h-3.5" /> Stop
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Image Upload Mode */}
              {inputMode === 'image' && (
                <div className="rounded-2xl border-2 border-dashed border-[#B6ADA4] bg-[#F7F4F2] p-6 text-center space-y-3">
                  <div id="mobileQrImageDecoder" className="hidden" />
                  <ImageIcon className="w-8 h-8 text-[#016836] mx-auto" />
                  <p className="text-sm font-bold text-[#26211E]">Upload SABIS® QR Pass Screenshot / Image</p>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white transition">
                    <span>Choose QR Image File</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              )}

              {/* Manual Entry & Quick Test */}
              {inputMode === 'manual' && (
                <div className="space-y-4">
                  <form onSubmit={handleManualSubmit} className="space-y-2">
                    <label className="block text-xs font-bold text-[#26211E]">
                      Enter Pass Code (e.g., EVT-2026-1004-1) or Parent #
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="EVT-2026-1004-1 or PAR-11530"
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-xs sm:text-sm font-mono text-[#26211E] focus:outline-none focus:border-[#016836]"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white transition"
                      >
                        Verify
                      </button>
                    </div>
                  </form>

                  <div className="pt-3 border-t border-[#E3DBD3] space-y-2.5">
                    <label className="block text-xs font-bold text-[#26211E]">
                      Quick Pass Test (Select Registered Pass)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={selectedSimPass}
                        onChange={(e) => setSelectedSimPass(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#B6ADA4] text-xs text-[#26211E]"
                      >
                        {allPasses.length === 0 ? (
                          <option value="">No passes registered for this event yet</option>
                        ) : (
                          allPasses.map(({ pass }) => (
                            <option key={pass.passCode} value={pass.passCode}>
                              [{pass.status === 'USED' ? 'USED' : 'VALID'}] {pass.passCode} —{' '}
                              {pass.attendeeLabel} ({pass.passIndex}/{pass.totalPasses})
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        type="button"
                        disabled={allPasses.length === 0}
                        onClick={simulateSelected}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#01522B] text-white shrink-0 disabled:opacity-40"
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
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#F2DEDE] hover:bg-[#E53C2E] hover:text-white text-[#E53C2E] border border-[#E53C2E]/35 transition"
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
                className={`rounded-2xl p-5 border-2 shadow-md transition-all space-y-4 ${
                  lastResult.status === 'VALID'
                    ? 'border-[#016836] bg-[#DFF0D8]'
                    : lastResult.status === 'USED'
                    ? 'border-[#8A6D3B] bg-[#FCF8E3]'
                    : 'border-[#E53C2E] bg-[#F2DEDE]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white ${
                      lastResult.status === 'VALID'
                        ? 'bg-[#016836]'
                        : lastResult.status === 'USED'
                        ? 'bg-[#8A6D3B]'
                        : 'bg-[#E53C2E]'
                    }`}
                  >
                    {lastResult.status === 'VALID' && <CheckCircle2 className="w-7 h-7" />}
                    {lastResult.status === 'USED' && <AlertTriangle className="w-7 h-7" />}
                    {lastResult.status === 'INVALID' && <XCircle className="w-7 h-7" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold text-white ${
                          lastResult.status === 'VALID'
                            ? 'bg-[#016836]'
                            : lastResult.status === 'USED'
                            ? 'bg-[#8A6D3B]'
                            : 'bg-[#E53C2E]'
                        }`}
                      >
                        {lastResult.status}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#26211E]">
                        Scanned at {formatTimeOnly(lastResult.scannedAt)}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-[#26211E] mt-1">
                      {lastResult.headline}
                    </h3>
                    <p className="text-xs text-[#26211E]/85 mt-0.5">{lastResult.subtext}</p>
                    {lastResult.status === 'USED' && lastResult.firstUsedAt && (
                      <p className="text-xs font-mono font-bold text-[#8A6D3B] mt-1">
                        Previously Used At: {formatTimeOnly(lastResult.firstUsedAt)}
                      </p>
                    )}
                  </div>
                </div>

                {lastResult.registration && lastResult.pass && (
                  <div className="grid grid-cols-2 gap-2.5 text-xs bg-white rounded-xl p-3.5 border border-[#E3DBD3]">
                    <div>
                      <span className="text-[#7B6E65] block text-[11px]">Attendee &amp; Pass</span>
                      <span className="font-bold text-[#26211E]">
                        {lastResult.pass.attendeeLabel} ({lastResult.pass.passIndex}/
                        {lastResult.pass.totalPasses})
                      </span>
                    </div>
                    <div>
                      <span className="text-[#7B6E65] block text-[11px]">Pass Code</span>
                      <span className="font-mono font-bold text-[#016836]">
                        {lastResult.pass.passCode}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#7B6E65] block text-[11px]">Tier &amp; Parent #</span>
                      <span className="font-semibold text-[#26211E]">
                        {lastResult.registration.category} •{' '}
                        {lastResult.registration.parentNumber || lastResult.registration.id}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#7B6E65] block text-[11px]">School</span>
                      <span className="font-semibold text-[#26211E] truncate block">
                        {getSchoolDisplay(lastResult.registration)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <EventLogsPanel logs={scanLogs} canClear={false} compact={true} />
          </div>
        ) : (
          <EventLogsPanel logs={scanLogs} canClear={false} />
        )}
      </main>
    </div>
  );
};

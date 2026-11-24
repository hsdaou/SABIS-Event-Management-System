import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Keyboard,
  QrCode,
  RefreshCw,
  StopCircle,
  SwitchCamera,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { EventLogsPanel } from '../components/EventLogsPanel';
import { PassInspectorModal } from '../components/PassInspectorModal';
import { StaffDeskRegistration } from '../components/StaffDeskRegistration';
import { TopBar } from '../components/TopBar';
import { useEvent, type ScanResult } from '../context/EventContext';
import { buildPassQrPayload, formatTimeOnly, getSchoolDisplay } from '../lib/qr';
import type { Registration } from '../types';

type MobileTab = 'scanner' | 'desk' | 'logs';
type InputMode = 'camera' | 'image' | 'manual';

interface BrowserBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

function createNativeBarcodeDetector(): BrowserBarcodeDetector | null {
  try {
    const Ctor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => BrowserBarcodeDetector;
      }
    ).BarcodeDetector;
    if (Ctor) {
      return new Ctor({ formats: ['qr_code'] });
    }
  } catch {
    // fallback to jsQR
  }
  return null;
}

async function decodeCanvasQr(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  detector: BrowserBarcodeDetector | null
): Promise<string | null> {
  // Engine 1: Native hardware-accelerated BarcodeDetector (when available)
  if (detector) {
    try {
      const codes = await detector.detect(canvas);
      const val = codes?.[0]?.rawValue?.trim();
      if (val) return val;
    } catch {
      // fall through to jsQR
    }
  }

  // Engine 2: Pure-JS jsQR full-frame decoder (works on 100% of iOS Safari & Android Chrome)
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = jsQR(imageData.data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (decoded?.data?.trim()) {
      return decoded.data.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

export const GateControlPage: React.FC = () => {
  const { activeEvent, hasAssignedEvents, venues, registrations, scanLogs, scanQrCode, refreshData, showToast } = useEvent();

  const [mobileTab, setMobileTab] = useState<MobileTab>('scanner');
  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [activeGate, setActiveGate] = useState(venues[0]?.name || 'Gate A - Main Campus Entrance');
  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('Tap "Start Camera Scanner" to scan attendee QR codes.');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [manualCode, setManualCode] = useState('');
  const [selectedSimPass, setSelectedSimPass] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [inspectingReg, setInspectingReg] = useState<Registration | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const detectorRef = useRef<BrowserBarcodeDetector | null>(null);
  const isDecodingRef = useRef<boolean>(false);
  const lastDecodedRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const activeGateRef = useRef(activeGate);
  const scanQrCodeRef = useRef(scanQrCode);

  useEffect(() => {
    if (venues.length > 0 && !venues.some((v) => v.name === activeGate)) {
      setActiveGate(venues[0].name);
    }
  }, [activeGate, venues]);

  useEffect(() => {
    activeGateRef.current = activeGate;
  }, [activeGate]);

  useEffect(() => {
    scanQrCodeRef.current = scanQrCode;
  }, [scanQrCode]);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    isDecodingRef.current = false;
    setCameraRunning(false);
    setCameraStatus('Camera stopped.');
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleDecodedScan = useCallback(async (raw: string) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return;

    const now = Date.now();
    if (lastDecodedRef.current.code === cleaned && now - lastDecodedRef.current.ts < 2500) {
      return;
    }
    lastDecodedRef.current = { code: cleaned, ts: now };

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(80);
      } catch {
        // ignore
      }
    }

    setProcessingScan(true);
    try {
      const result = await scanQrCodeRef.current(cleaned, activeGateRef.current);
      setLastResult(result);
    } finally {
      setProcessingScan(false);
    }
  }, []);

  const startCamera = useCallback(
    async (explicitDeviceId?: string) => {
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('Camera API unavailable in this browser — switched to Manual mode.');
        showToast('Camera unavailable; switched to Manual mode.', 'warning');
        setInputMode('manual');
        return;
      }

      try {
        setCameraStatus('Requesting rear camera permission...');
        const deviceToUse = explicitDeviceId ?? selectedCameraId;
        const videoConstraints: MediaTrackConstraints = deviceToUse
          ? { deviceId: { exact: deviceToUse }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = stream;

        // Populate camera list once permission is granted (so officers can switch away from ultra-wide lens if needed)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setCameras(videoInputs);
          const activeTrack = stream.getVideoTracks()[0];
          const activeDeviceId = activeTrack?.getSettings?.().deviceId || '';
          if (activeDeviceId) setSelectedCameraId(activeDeviceId);
        } catch {
          // ignore enumeration errors
        }

        const video = videoRef.current;
        if (!video) throw new Error('Video element not ready');
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play();

        if (!detectorRef.current) {
          detectorRef.current = createNativeBarcodeDetector();
        }

        setCameraRunning(true);
        setCameraStatus('Live camera active — point at any SABIS® QR pass.');

        // Scan full video frames at ~10 fps using BarcodeDetector + jsQR
        scanTimerRef.current = window.setInterval(async () => {
          if (isDecodingRef.current) return;
          const v = videoRef.current;
          const c = canvasRef.current;
          if (!v || !c || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;

          isDecodingRef.current = true;
          try {
            const maxDim = 800;
            const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
            const targetW = Math.max(1, Math.round(v.videoWidth * scale));
            const targetH = Math.max(1, Math.round(v.videoHeight * scale));
            if (c.width !== targetW || c.height !== targetH) {
              c.width = targetW;
              c.height = targetH;
            }
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            ctx.drawImage(v, 0, 0, targetW, targetH);
            const decoded = await decodeCanvasQr(c, ctx, detectorRef.current);
            if (decoded) {
              await handleDecodedScan(decoded);
            }
          } finally {
            isDecodingRef.current = false;
          }
        }, 100);
      } catch (err) {
        console.error('Camera start failed:', err);
        setCameraStatus('Camera unavailable on this device/browser — switched to Manual / Image mode.');
        showToast('Camera unavailable; switched to Manual mode.', 'warning');
        setInputMode('manual');
      }
    },
    [handleDecodedScan, selectedCameraId, showToast, stopCamera]
  );

  const handleSwitchCamera = async () => {
    if (cameras.length < 2) return;
    const currentIdx = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextCam = cameras[(currentIdx + 1) % cameras.length];
    if (nextCam) {
      setSelectedCameraId(nextCam.deviceId);
      await startCamera(nextCam.deviceId);
      showToast(`Switched camera: ${nextCam.label || 'Next lens'}`, 'info');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });

      const detector = detectorRef.current || createNativeBarcodeDetector();
      detectorRef.current = detector;

      // Try native resolution (capped to 1200px) and scaled 640px for maximum reliability on phone screenshots
      let decoded: string | null = null;
      for (const maxDim of [1200, 640]) {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0, w, h);
        decoded = await decodeCanvasQr(off, ctx, detector);
        if (decoded) break;
      }

      if (decoded) {
        await handleDecodedScan(decoded);
      } else {
        const match = file.name.match(/EVT-[A-Z0-9]+-[A-Z0-9]+(?:-\d+)?|PAR-[A-Z0-9]+/i);
        if (match) {
          await handleDecodedScan(match[0].toUpperCase());
        } else {
          const res = await scanQrCodeRef.current('UNREADABLE_QR_IMAGE', activeGateRef.current);
          setLastResult(res);
        }
      }
    } catch {
      const res = await scanQrCodeRef.current('UNREADABLE_QR_IMAGE', activeGateRef.current);
      setLastResult(res);
    }
    e.target.value = '';
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const result = await scanQrCodeRef.current(manualCode.trim(), activeGateRef.current);
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
    const res = await scanQrCodeRef.current(payload, activeGateRef.current);
    setLastResult(res);
  };

  const handleRefreshPasses = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
    showToast('Synced latest registrations & passes', 'success');
  };

  if (!hasAssignedEvents) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F4F2]">
        <TopBar />
        <main className="max-w-lg mx-auto w-full px-4 py-16 flex-1 flex items-center justify-center">
          <div className="glass-panel rounded-2xl p-7 border-t-4 border-t-[#8A6D3B] text-center space-y-2.5">
            <h2 className="text-lg font-bold text-[#26211E]">No Events Assigned Yet</h2>
            <p className="text-xs text-[#7B6E65] leading-relaxed">
              Your Gate Control account is not currently assigned to any event. Please ask a Control Dashboard Administrator to authorize you for your event(s).
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4F2]">
      <TopBar />

      <main
        className={`${
          mobileTab === 'desk' ? 'max-w-7xl' : 'max-w-3xl'
        } mx-auto w-full px-4 py-5 space-y-5 flex-1 transition-all`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#016836]">
              {activeEvent.name}
            </span>
            <h2 className="text-lg font-bold text-[#26211E]">Mobile Gate Control Terminal</h2>
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefreshPasses}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-[#EDF6F1] text-[#016836] border border-[#E3DBD3] flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{allPasses.length} Passes Synced</span>
          </button>
        </div>

        {/* Gate Control Mode Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-1.5 rounded-2xl border border-[#E3DBD3] shadow-sm">
          <button
            type="button"
            onClick={() => setMobileTab('scanner')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
              mobileTab === 'scanner'
                ? 'bg-[#016836] text-white shadow-sm'
                : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>Gate QR Scanner</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (cameraRunning) stopCamera();
              setMobileTab('desk');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 text-center leading-tight transition ${
              mobileTab === 'desk'
                ? 'bg-[#016836] text-white shadow-sm'
                : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
            }`}
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>Staff Desk Manual Registration &amp; Pass Lookup</span>
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
                : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
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

              {/* Camera Mode — Native Full-Frame Video + Dual Engine (BarcodeDetector + jsQR) */}
              {inputMode === 'camera' && (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-[#26211E] border border-[#E3DBD3] min-h-[280px] flex flex-col items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`w-full max-h-[380px] object-cover ${cameraRunning ? 'block' : 'hidden'}`}
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {cameraRunning && (
                      <>
                        {/* Subtle center alignment frame + scan laser (full frame is still scanned!) */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="w-56 h-56 border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.28)] relative overflow-hidden">
                            <div className="scan-laser w-full" />
                          </div>
                        </div>
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>{processingScan ? 'Verifying...' : 'Scanning Live'}</span>
                        </div>
                      </>
                    )}

                    {!cameraRunning && (
                      <div className="text-center space-y-3 py-8 px-4">
                        <div className="w-12 h-12 rounded-2xl bg-[#016836]/25 border border-[#016836] flex items-center justify-center mx-auto">
                          <Camera className="w-6 h-6 text-[#DFF0D8]" />
                        </div>
                        <p className="text-sm font-bold text-white">SABIS® Mobile Gate QR Camera</p>
                        <p className="text-xs text-[#E3DBD3] max-w-xs mx-auto">
                          Scan each attendee&apos;s individual SABIS® QR code to verify VALID, USED, or INVALID status immediately.
                        </p>
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#016836] hover:bg-[#046937] text-white shadow-lg transition"
                        >
                          Start Camera Scanner
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7B6E65]">
                    <span>{cameraStatus}</span>
                    {cameraRunning && (
                      <div className="flex items-center gap-2">
                        {cameras.length > 1 && (
                          <button
                            type="button"
                            onClick={handleSwitchCamera}
                            className="px-3 py-1 rounded-lg bg-[#E6F4FA] text-[#0080BB] border border-[#0080BB]/30 flex items-center gap-1 font-semibold"
                          >
                            <SwitchCamera className="w-3.5 h-3.5" /> Switch Lens
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-1 rounded-lg bg-[#F2DEDE] text-[#E53C2E] border border-[#E53C2E]/30 flex items-center gap-1 font-semibold"
                        >
                          <StopCircle className="w-3.5 h-3.5" /> Stop
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Image Upload Mode */}
              {inputMode === 'image' && (
                <div className="rounded-2xl border-2 border-dashed border-[#B6ADA4] bg-[#F7F4F2] p-6 text-center space-y-3">
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
                      Enter Pass Code (e.g., EVT-26-...-1) or Parent #
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="EVT-26-...-1 or PAR-11530"
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
                        const res = await scanQrCodeRef.current('FAKE-PASS-9999', activeGateRef.current);
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
                    {lastResult.eventName && (
                      <p className="text-xs font-semibold text-[#016836] mt-0.5">
                        Event: {lastResult.eventName}
                      </p>
                    )}
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
        ) : mobileTab === 'desk' ? (
          <StaffDeskRegistration onInspectAllPasses={setInspectingReg} />
        ) : (
          <EventLogsPanel logs={scanLogs} canClear={false} />
        )}
      </main>

      <PassInspectorModal registration={inspectingReg} onClose={() => setInspectingReg(null)} />
    </div>
  );
};

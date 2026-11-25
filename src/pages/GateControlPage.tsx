import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Flashlight,
  Image as ImageIcon,
  Keyboard,
  QrCode,
  RefreshCw,
  StopCircle,
  SwitchCamera,
  UserPlus,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import { EventLogsPanel } from '../components/EventLogsPanel';
import { PassInspectorModal } from '../components/PassInspectorModal';
import { StaffDeskRegistration } from '../components/StaffDeskRegistration';
import { TopBar } from '../components/TopBar';
import { useEvent, type ScanResult } from '../context/EventContext';
import { buildPassQrPayload, formatTimeOnly, getSchoolDisplay, unlockScannerAudio } from '../lib/qr';
import type { Registration } from '../types';

type MobileTab = 'scanner' | 'desk' | 'logs';
type InputMode = 'camera' | 'image' | 'manual';

interface BrowserBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

let zxingConfigured = false;
function ensureZXingWasmReady(): Promise<boolean> {
  if (!zxingConfigured) {
    zxingConfigured = true;
    try {
      prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? `/wasm/${path}` : prefix + path,
        },
        fireImmediately: true,
      });
    } catch {
      return Promise.resolve(false);
    }
  }
  return Promise.resolve(
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? `/wasm/${path}` : prefix + path,
      },
      fireImmediately: true,
    })
  )
    .then(() => true)
    .catch(() => false);
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
    // fallback to ZXing WASM / jsQR
  }
  return null;
}

async function decodeCanvasQr(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  detector: BrowserBarcodeDetector | null,
  zxingReady: boolean
): Promise<string | null> {
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) return null;

  // Engine 1: Native hardware-accelerated BarcodeDetector (instant on Android Chrome / Edge / macOS)
  if (detector) {
    try {
      const codes = await detector.detect(canvas);
      const val = codes?.[0]?.rawValue?.trim();
      if (val) return val;
    } catch {
      // fall through to ZXing-C++ WASM
    }
  }

  let imageData: ImageData | null = null;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    return null;
  }

  // Engine 2: Industrial C++ ZXing-cpp WebAssembly (works on iOS Safari, Android, Desktop; handles glare, tilt & legacy logos)
  if (zxingReady) {
    try {
      const results = await readBarcodes(imageData, {
        formats: ['QRCode'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1,
      });
      const text = results?.[0]?.text?.trim();
      if (text) return text;
    } catch {
      // fall through to jsQR
    }
  }

  // Engine 3: Pure-JS jsQR fallback
  try {
    const decoded = jsQR(imageData.data, width, height, {
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
  const { activeEvent, hasAssignedEvents, venues, registrations, scanLogs, scanQrCode, refreshData, showToast } =
    useEvent();

  const [mobileTab, setMobileTab] = useState<MobileTab>('scanner');
  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [activeGate, setActiveGate] = useState(venues[0]?.name || 'Gate A - Main Campus Entrance');
  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('Tap "Start Camera Scanner" to scan attendee QR codes.');
  const [cameraRes, setCameraRes] = useState('');
  const [zxingReady, setZxingReady] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [manualCode, setManualCode] = useState('');
  const [selectedSimPass, setSelectedSimPass] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [overlayVerdict, setOverlayVerdict] = useState<ScanResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [inspectingReg, setInspectingReg] = useState<Registration | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopTimerRef = useRef<number | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const runningRef = useRef<boolean>(false);
  const frameTickRef = useRef<number>(0);
  const zxingReadyRef = useRef<boolean>(false);
  const detectorRef = useRef<BrowserBarcodeDetector | null>(null);
  const lastDecodedRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const activeGateRef = useRef(activeGate);
  const scanQrCodeRef = useRef(scanQrCode);

  useEffect(() => {
    ensureZXingWasmReady().then((ok) => {
      zxingReadyRef.current = ok;
      setZxingReady(ok);
    });
  }, []);

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
    runningRef.current = false;
    if (scanLoopTimerRef.current !== null) {
      window.clearTimeout(scanLoopTimerRef.current);
      scanLoopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraRunning(false);
    setCameraRes('');
    setTorchSupported(false);
    setTorchOn(false);
    setZoomRange(null);
    setZoomLevel(1);
    setCameraStatus('Camera stopped.');
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current);
      }
    };
  }, [stopCamera]);

  const publishScanResult = useCallback(
    (result: ScanResult) => {
      setLastResult(result);
      setOverlayVerdict(result);
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current);
      }
      overlayTimerRef.current = window.setTimeout(() => {
        setOverlayVerdict(null);
      }, 3200);

      showToast(
        result.status === 'VALID'
          ? `${result.headline} — ${result.pass?.attendeeLabel || ''}`
          : `${result.headline}: ${result.subtext}`,
        result.status === 'VALID' ? 'success' : result.status === 'USED' ? 'warning' : 'error'
      );
    },
    [showToast]
  );

  const handleDecodedScan = useCallback(
    async (raw: string) => {
      const cleaned = String(raw || '').trim();
      if (!cleaned) return;

      const now = Date.now();
      if (lastDecodedRef.current.code === cleaned && now - lastDecodedRef.current.ts < 2500) {
        return;
      }
      lastDecodedRef.current = { code: cleaned, ts: now };

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate([70]);
        } catch {
          // ignore
        }
      }

      setProcessingScan(true);
      try {
        const result = await scanQrCodeRef.current(cleaned, activeGateRef.current);
        publishScanResult(result);
      } finally {
        setProcessingScan(false);
      }
    },
    [publishScanResult]
  );

  const startCamera = useCallback(
    async (explicitDeviceId?: string) => {
      unlockScannerAudio();
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('Camera API unavailable in this browser — switched to Manual mode.');
        showToast('Camera unavailable; switched to Manual mode.', 'warning');
        setInputMode('manual');
        return;
      }

      try {
        setCameraStatus('Starting rear camera...');
        const deviceToUse = explicitDeviceId ?? selectedCameraId;
        const primaryConstraints: MediaTrackConstraints = deviceToUse
          ? {
              deviceId: { exact: deviceToUse },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: primaryConstraints,
            audio: false,
          });
        } catch {
          // Fallback to simplest possible rear-camera constraint on strict mobile browsers
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          });
        }

        streamRef.current = stream;

        // Enable continuous autofocus and detect torch/zoom capabilities when supported
        const activeTrack = stream.getVideoTracks()[0];
        if (activeTrack) {
          try {
            const caps = (activeTrack.getCapabilities?.() || {}) as Record<string, unknown>;
            if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
              await activeTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
              });
            }
            if (caps.torch) {
              setTorchSupported(true);
            }
            const zoomCap = caps.zoom as { min?: number; max?: number } | undefined;
            if (zoomCap && typeof zoomCap.min === 'number' && typeof zoomCap.max === 'number' && zoomCap.max > zoomCap.min) {
              setZoomRange({ min: zoomCap.min, max: Math.min(zoomCap.max, 3) });
              setZoomLevel(Math.max(zoomCap.min, 1));
            }
          } catch {
            // ignore unsupported hardware capabilities
          }
        }

        // Populate available lenses once permission is granted
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setCameras(videoInputs);
          const activeDeviceId = activeTrack?.getSettings?.().deviceId || '';
          if (activeDeviceId) setSelectedCameraId(activeDeviceId);
        } catch {
          // ignore enumeration errors
        }

        const video = videoRef.current;
        if (!video) throw new Error('Video element not ready');

        // CRITICAL for iOS Safari: video must NEVER be display:none when play() is called!
        setCameraRunning(true);
        runningRef.current = true;
        frameTickRef.current = 0;

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;

        await video.play();

        // Wait briefly for video metadata if dimensions aren't ready immediately
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          await new Promise<void>((resolve) => {
            const onReady = () => {
              video.removeEventListener('loadedmetadata', onReady);
              resolve();
            };
            video.addEventListener('loadedmetadata', onReady);
            window.setTimeout(() => {
              video.removeEventListener('loadedmetadata', onReady);
              resolve();
            }, 1500);
          });
        }

        if (!detectorRef.current) {
          detectorRef.current = createNativeBarcodeDetector();
        }
        if (!zxingReadyRef.current) {
          ensureZXingWasmReady().then((ok) => {
            zxingReadyRef.current = ok;
            setZxingReady(ok);
          });
        }

        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setCameraRes(`${video.videoWidth}×${video.videoHeight}`);
        }
        setCameraStatus('Live camera active — hold QR code inside the frame.');

        // Non-overlapping Dual-ROI scan loop (alternates native-res center crop & full frame)
        const scanNextFrame = async () => {
          if (!runningRef.current) return;
          const v = videoRef.current;
          const c = canvasRef.current;

          if (v && c && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
            setCameraRes((prev) => prev || `${v.videoWidth}×${v.videoHeight}`);

            try {
              const ctx = c.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                const tick = frameTickRef.current++;
                const vw = v.videoWidth;
                const vh = v.videoHeight;

                if (tick % 2 === 0) {
                  // Pass A: High-resolution 1:1 center crop (matches viewfinder box; 2.5x sharper on phone screens!)
                  const cropSize = Math.round(Math.min(vw, vh) * 0.72);
                  const sx = Math.round((vw - cropSize) / 2);
                  const sy = Math.round((vh - cropSize) / 2);
                  const outSize = Math.min(640, cropSize);
                  if (c.width !== outSize || c.height !== outSize) {
                    c.width = outSize;
                    c.height = outSize;
                  }
                  ctx.drawImage(v, sx, sy, cropSize, cropSize, 0, 0, outSize, outSize);
                } else {
                  // Pass B: Full camera frame (catches off-center or very close QR codes)
                  const maxDim = 960;
                  const scale = Math.min(1, maxDim / Math.max(vw, vh));
                  const targetW = Math.max(1, Math.round(vw * scale));
                  const targetH = Math.max(1, Math.round(vh * scale));
                  if (c.width !== targetW || c.height !== targetH) {
                    c.width = targetW;
                    c.height = targetH;
                  }
                  ctx.drawImage(v, 0, 0, targetW, targetH);
                }

                const decoded = await decodeCanvasQr(
                  c,
                  ctx,
                  detectorRef.current,
                  zxingReadyRef.current
                );
                if (decoded && runningRef.current) {
                  await handleDecodedScan(decoded);
                }
              }
            } catch {
              // continue scanning next frame
            }
          }

          if (runningRef.current) {
            scanLoopTimerRef.current = window.setTimeout(scanNextFrame, 80);
          }
        };

        scanLoopTimerRef.current = window.setTimeout(scanNextFrame, 120);
      } catch (err) {
        console.error('Camera start failed:', err);
        stopCamera();
        setCameraStatus('Camera permission denied or unavailable — switched to Manual / Image mode.');
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

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      showToast('Flashlight toggle is not supported on this lens.', 'warning');
    }
  };

  const handleCycleZoom = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track || !zoomRange) return;
    const steps = [1, 1.5, 2].filter((z) => z >= zoomRange.min && z <= zoomRange.max);
    const currentIdx = steps.findIndex((z) => Math.abs(z - zoomLevel) < 0.15);
    const nextZoom = steps[(currentIdx + 1) % steps.length] || zoomRange.min;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet],
      });
      setZoomLevel(nextZoom);
    } catch {
      // ignore
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    unlockScannerAudio();
    setProcessingScan(true);
    try {
      let decoded: string | null = null;

      // Pass 1: Direct industrial ZXing-C++ WASM decode on the original uploaded file (handles screenshots & logos!)
      const wasmOk = zxingReadyRef.current || (await ensureZXingWasmReady());
      if (wasmOk) {
        try {
          const results = await readBarcodes(file, {
            formats: ['QRCode'],
            tryHarder: true,
            tryRotate: true,
            tryInvert: true,
            tryDownscale: true,
            tryDenoise: true,
            maxNumberOfSymbols: 1,
          });
          decoded = results?.[0]?.text?.trim() || null;
        } catch {
          // fall through to canvas multi-scale decode
        }
      }

      // Pass 2: Multi-scale canvas fallback (BarcodeDetector + ZXing + jsQR)
      if (!decoded) {
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

        for (const maxDim of [1400, 800, 500]) {
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const off = document.createElement('canvas');
          off.width = w;
          off.height = h;
          const ctx = off.getContext('2d', { willReadFrequently: true });
          if (!ctx) continue;
          ctx.drawImage(img, 0, 0, w, h);
          decoded = await decodeCanvasQr(off, ctx, detector, wasmOk);
          if (decoded) break;
        }
      }

      if (decoded) {
        const result = await scanQrCodeRef.current(decoded, activeGateRef.current);
        publishScanResult(result);
      } else {
        const match = file.name.match(/EVT-[A-Z0-9]+-[A-Z0-9]+(?:-\d+)?|PAR-[A-Z0-9]+/i);
        if (match) {
          const result = await scanQrCodeRef.current(match[0].toUpperCase(), activeGateRef.current);
          publishScanResult(result);
        } else {
          const res = await scanQrCodeRef.current('UNREADABLE_QR_IMAGE', activeGateRef.current);
          publishScanResult(res);
        }
      }
    } catch {
      const res = await scanQrCodeRef.current('UNREADABLE_QR_IMAGE', activeGateRef.current);
      publishScanResult(res);
    } finally {
      setProcessingScan(false);
    }
    e.target.value = '';
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    unlockScannerAudio();
    const result = await scanQrCodeRef.current(manualCode.trim(), activeGateRef.current);
    publishScanResult(result);
    setManualCode('');
  };

  const allPasses = registrations.flatMap((r) => r.passes.map((p) => ({ reg: r, pass: p })));

  const simulateSelected = async () => {
    const targetCode = selectedSimPass || allPasses[0]?.pass.passCode;
    if (!targetCode) return;
    unlockScannerAudio();
    const found = allPasses.find((x) => x.pass.passCode === targetCode);
    const payload = found ? buildPassQrPayload(found.reg, found.pass) : targetCode;
    const res = await scanQrCodeRef.current(payload, activeGateRef.current);
    publishScanResult(res);
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

  const activeEngineLabel = zxingReady
    ? detectorRef.current
      ? 'Native + ZXing-C++ WASM'
      : 'ZXing-C++ WASM'
    : 'jsQR';

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
            {/* Instant High-Contrast Scan Verdict Banner — Placed ABOVE the camera so it's immediately visible on phones! */}
            {lastResult && (
              <div
                className={`rounded-2xl p-4 sm:p-5 border-2 shadow-md transition-all space-y-3.5 ${
                  lastResult.status === 'VALID'
                    ? 'border-[#016836] bg-[#DFF0D8]'
                    : lastResult.status === 'USED'
                    ? 'border-[#8A6D3B] bg-[#FCF8E3]'
                    : 'border-[#E53C2E] bg-[#F2DEDE]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white ${
                      lastResult.status === 'VALID'
                        ? 'bg-[#016836]'
                        : lastResult.status === 'USED'
                        ? 'bg-[#8A6D3B]'
                        : 'bg-[#E53C2E]'
                    }`}
                  >
                    {lastResult.status === 'VALID' && <CheckCircle2 className="w-6 h-6" />}
                    {lastResult.status === 'USED' && <AlertTriangle className="w-6 h-6" />}
                    {lastResult.status === 'INVALID' && <XCircle className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/80 text-[#26211E]">
                        {lastResult.status}
                      </span>
                      <span className="text-xs font-mono text-[#7B6E65]">
                        Scanned at {formatTimeOnly(lastResult.scannedAt)}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-[#26211E] mt-1">
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

            {/* Active Venue Selector + Scanner Card */}
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

              {/* Camera Mode — Native Video (never display:none!) + ZXing-C++ WASM + BarcodeDetector + Dual-ROI */}
              {inputMode === 'camera' && (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-[#26211E] border border-[#E3DBD3] min-h-[300px] sm:min-h-[340px] flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`w-full h-[320px] sm:h-[380px] object-cover transition-opacity ${
                        cameraRunning ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {cameraRunning && (
                      <>
                        {/* Center alignment box (matched by high-res center crop pass!) */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="w-56 h-56 border-2 border-white/85 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.28)] relative overflow-hidden">
                            <div className="scan-laser w-full" />
                          </div>
                        </div>

                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/65 text-white text-[11px] font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>{processingScan ? 'Verifying...' : 'Scanning Live'}</span>
                        </div>

                        {/* Live On-Camera Verdict Flash Pill */}
                        {overlayVerdict && (
                          <div
                            className={`absolute bottom-3 left-3 right-3 px-3.5 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg flex items-center justify-between gap-2 ${
                              overlayVerdict.status === 'VALID'
                                ? 'bg-[#016836]/95'
                                : overlayVerdict.status === 'USED'
                                ? 'bg-[#8A6D3B]/95'
                                : 'bg-[#E53C2E]/95'
                            }`}
                          >
                            <span className="truncate">{overlayVerdict.headline}</span>
                            {overlayVerdict.pass && (
                              <span className="font-mono text-[11px] shrink-0">
                                {overlayVerdict.pass.passCode}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {!cameraRunning && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-3 py-8 px-4">
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
                    <div className="space-y-0.5">
                      <span className="block">{cameraStatus}</span>
                      <span className="block text-[11px] font-mono text-[#7B6E65]/80">
                        Engine: {activeEngineLabel}
                        {cameraRes ? ` • ${cameraRes}` : ''}
                      </span>
                    </div>
                    {cameraRunning && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {torchSupported && (
                          <button
                            type="button"
                            onClick={handleToggleTorch}
                            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 font-semibold transition ${
                              torchOn
                                ? 'bg-[#FCF8E3] text-[#8A6D3B] border-[#8A6D3B]/40'
                                : 'bg-white text-[#26211E] border-[#E3DBD3]'
                            }`}
                          >
                            <Flashlight className="w-3.5 h-3.5" /> {torchOn ? 'Flash On' : 'Flash'}
                          </button>
                        )}
                        {zoomRange && (
                          <button
                            type="button"
                            onClick={handleCycleZoom}
                            className="px-2.5 py-1 rounded-lg bg-white text-[#26211E] border border-[#E3DBD3] flex items-center gap-1 font-semibold"
                          >
                            <ZoomIn className="w-3.5 h-3.5" /> {zoomLevel}×
                          </button>
                        )}
                        {cameras.length > 1 && (
                          <button
                            type="button"
                            onClick={handleSwitchCamera}
                            className="px-2.5 py-1 rounded-lg bg-[#E6F4FA] text-[#0080BB] border border-[#0080BB]/30 flex items-center gap-1 font-semibold"
                          >
                            <SwitchCamera className="w-3.5 h-3.5" /> Switch Lens
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-2.5 py-1 rounded-lg bg-[#F2DEDE] text-[#E53C2E] border border-[#E53C2E]/30 flex items-center gap-1 font-semibold"
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
                    <span>{processingScan ? 'Decoding...' : 'Choose QR Image File'}</span>
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
                        unlockScannerAudio();
                        const res = await scanQrCodeRef.current('FAKE-PASS-9999', activeGateRef.current);
                        publishScanResult(res);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#F2DEDE] hover:bg-[#E53C2E] hover:text-white text-[#E53C2E] border border-[#E53C2E]/35 transition"
                    >
                      Test Invalid QR Code
                    </button>
                  </div>
                </div>
              )}
            </div>

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

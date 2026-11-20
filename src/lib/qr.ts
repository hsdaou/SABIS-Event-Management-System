import QRCode from 'qrcode';
import type { AttendeePass, Registration } from '../types';

export function slugifyVenue(name: string): string {
  return (
    String(name || 'venue')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'venue'
  );
}

export function formatTimeOnly(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' })} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })}`;
}

export function buildPassQrPayload(registration: Registration, pass: AttendeePass): string {
  return JSON.stringify({
    v: 5,
    passCode: pass.passCode,
    regId: registration.id,
    passIndex: pass.passIndex,
    totalPasses: pass.totalPasses,
    parentNumber: registration.parentNumber || registration.id,
    name: pass.attendeeLabel || registration.name,
    tier: registration.category,
    venue: registration.assignedGate,
  });
}

export async function generateQrDataUrl(payload: string, width = 220): Promise<string> {
  return QRCode.toDataURL(payload, {
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

export async function downloadPassPng(
  registration: Registration,
  pass: AttendeePass,
  eventTitle: string
): Promise<void> {
  const payload = buildPassQrPayload(registration, pass);
  const qrUrl = await generateQrDataUrl(payload, 240);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = qrUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isVip = registration.category === 'VIP';
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = isVip ? '#f59e0b' : '#6366f1';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  ctx.fillStyle = isVip ? '#fbbf24' : '#818cf8';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${isVip ? 'VIP PASS' : 'REGULAR PARENT PASS'} • PASS ${pass.passIndex} OF ${pass.totalPasses}`,
    canvas.width / 2,
    48
  );

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText(eventTitle.slice(0, 56), canvas.width / 2, 70);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(pass.attendeeLabel || registration.name || 'Attendee', canvas.width / 2, 108);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(
    `Parent #: ${registration.parentNumber || 'N/A'}${pass.attendeeAge ? ` • Age: ${pass.attendeeAge}` : ''}`,
    canvas.width / 2,
    134
  );

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(130, 156, 240, 240);
  ctx.drawImage(img, 138, 164, 224, 224);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(pass.passCode, canvas.width / 2, 430);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText(`Venue: ${registration.assignedGate}`, canvas.width / 2, 470);

  const schoolDisplay =
    registration.schoolType === 'sabis_isc'
      ? registration.schoolBranch
      : registration.schoolOther;
  if (schoolDisplay) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(schoolDisplay.slice(0, 62), canvas.width / 2, 498);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px Inter, sans-serif';
  ctx.fillText(
    `Contact: ${registration.phone || registration.email || '—'}`,
    canvas.width / 2,
    528
  );

  ctx.fillStyle = '#64748b';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText(
    'Single-use entry QR pass — Present to Gate Control staff at entrance',
    canvas.width / 2,
    588
  );

  const link = document.createElement('a');
  const safeName = (pass.attendeeLabel || registration.name || 'Pass').replace(/[^a-z0-9]/gi, '_');
  link.download = `${pass.passCode}_${safeName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

let sharedAudioCtx: AudioContext | null = null;

export function playScannerTone(type: 'VALID' | 'USED' | 'INVALID', muted: boolean): void {
  if (muted) return;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioContextClass();
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }

    const now = sharedAudioCtx.currentTime;
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);

    if (type === 'VALID') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1318.5, now + 0.09);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'USED') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(420, now + 0.12);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.start(now);
      osc.stop(now + 0.34);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(155, now + 0.15);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.start(now);
      osc.stop(now + 0.38);
    }
  } catch {
    // ignore audio block
  }
}

export function getSchoolDisplay(reg: Pick<Registration, 'schoolType' | 'schoolBranch' | 'schoolOther'>): string {
  if (reg.schoolType === 'sabis_isc' && reg.schoolBranch) return reg.schoolBranch;
  if (reg.schoolType === 'other' && reg.schoolOther) return reg.schoolOther;
  return 'Not specified';
}

export function getRegistrationStatus(reg: Registration): 'CHECKED_IN' | 'PARTIAL' | 'PENDING' {
  const total = reg.passes.length || reg.partySize || 1;
  const used = reg.passes.filter((p) => p.status === 'USED').length;
  if (used === 0) return 'PENDING';
  if (used >= total) return 'CHECKED_IN';
  return 'PARTIAL';
}

import QRCode from 'qrcode';
import type { AttendeePass, Registration } from '../types';

export const SABIS_GREEN = '#016836';
export const SABIS_GOLD = '#8A6D3B';
export const SABIS_CREAM = '#F7F4F2';
export const SABIS_STONE = '#E3DBD3';
export const SABIS_MUTED = '#7B6E65';
export const SABIS_INK = '#26211E';

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
    v: 6,
    eventId: registration.eventId,
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

let cachedCrestImg: HTMLImageElement | null = null;
let cachedWordmarkImg: HTMLImageElement | null = null;

function loadImageCached(src: string, cacheKey: 'crest' | 'wordmark'): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (cacheKey === 'crest' && cachedCrestImg) return Promise.resolve(cachedCrestImg);
  if (cacheKey === 'wordmark' && cachedWordmarkImg) return Promise.resolve(cachedWordmarkImg);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cacheKey === 'crest') cachedCrestImg = img;
      else cachedWordmarkImg = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Generates an official SABIS®-branded QR code Data URL:
 * - Modules rendered in official SABIS® Green (#016836)
 * - Error correction level 'H' (30% redundancy)
 * - Official SABIS® crest embedded cleanly in a crisp white center medallion
 */
export async function generateQrDataUrl(payload: string, width = 240): Promise<string> {
  const baseQrUrl = await QRCode.toDataURL(payload, {
    width,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: SABIS_GREEN,
      light: '#FFFFFF',
    },
  });

  if (typeof document === 'undefined') return baseQrUrl;

  try {
    const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = baseQrUrl;
    });

    const crest = await loadImageCached('/sabis-crest.png', 'crest');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = width;
    const ctx = canvas.getContext('2d');
    if (!ctx) return baseQrUrl;

    ctx.drawImage(qrImg, 0, 0, width, width);

    if (crest) {
      const badgeSize = Math.round(width * 0.22);
      const pad = Math.max(4, Math.round(width * 0.025));
      const box = badgeSize + pad * 2;
      const x = Math.round((width - box) / 2);
      const y = Math.round((width - box) / 2);
      const radius = Math.round(box * 0.2);

      // White protective medallion with subtle SABIS green ring
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(x, y, box, box, radius);
      ctx.fill();

      ctx.strokeStyle = SABIS_GREEN;
      ctx.lineWidth = Math.max(1.5, width * 0.008);
      ctx.stroke();

      ctx.drawImage(crest, x + pad, y + pad, badgeSize, badgeSize);
    }

    return canvas.toDataURL('image/png');
  } catch {
    return baseQrUrl;
  }
}

export async function downloadPassPng(
  registration: Registration,
  pass: AttendeePass,
  eventTitle: string
): Promise<void> {
  const payload = buildPassQrPayload(registration, pass);
  const qrUrl = await generateQrDataUrl(payload, 260);

  const qrImg = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = reject;
    qrImg.src = qrUrl;
  });

  const wordmark = await loadImageCached('/sabis-logo.svg', 'wordmark');

  const canvas = document.createElement('canvas');
  canvas.width = 540;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isVip = registration.category === 'VIP';
  const accent = isVip ? SABIS_GOLD : SABIS_GREEN;

  // Warm SABIS cream background
  ctx.fillStyle = SABIS_CREAM;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Inner white pass card
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(20, 20, canvas.width - 40, canvas.height - 40, 18);
  ctx.fill();
  ctx.strokeStyle = SABIS_STONE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Top SABIS Green (or VIP Gold) ribbon bar
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(20, 20, canvas.width - 40, 12, [18, 18, 0, 0]);
  ctx.fill();

  // Official SABIS® Logo at top center
  if (wordmark) {
    const logoH = 38;
    const logoW = Math.round((wordmark.naturalWidth || 148) * (logoH / (wordmark.naturalHeight || 42)));
    ctx.drawImage(wordmark, Math.round((canvas.width - logoW) / 2), 48, logoW, logoH);
  } else {
    ctx.fillStyle = SABIS_GREEN;
    ctx.font = 'bold 24px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SABIS®', canvas.width / 2, 76);
  }

  // Event Name
  ctx.textAlign = 'center';
  ctx.fillStyle = SABIS_MUTED;
  ctx.font = 'bold 13px Roboto, Arial, sans-serif';
  ctx.fillText(eventTitle.slice(0, 56).toUpperCase(), canvas.width / 2, 112);

  // Tier + Pass Pill
  ctx.fillStyle = isVip ? '#FCF8E3' : '#EDF6F1';
  ctx.beginPath();
  ctx.roundRect(120, 124, 300, 28, 14);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = 'bold 12px Roboto, Arial, sans-serif';
  ctx.fillText(
    `${isVip ? 'VIP INVITATION PASS' : 'REGULAR PARENT PASS'}  •  PASS ${pass.passIndex} OF ${pass.totalPasses}`,
    canvas.width / 2,
    142
  );

  // Attendee Name
  ctx.fillStyle = SABIS_INK;
  ctx.font = 'bold 22px Roboto, Arial, sans-serif';
  ctx.fillText(pass.attendeeLabel || registration.name || 'Attendee', canvas.width / 2, 184);

  // Parent Number & Age
  ctx.fillStyle = SABIS_MUTED;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(
    `Parent #: ${registration.parentNumber || 'N/A'}${pass.attendeeAge ? `  •  Age: ${pass.attendeeAge}` : ''}`,
    canvas.width / 2,
    208
  );

  // Branded SABIS® QR Code Frame
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(130, 224, 280, 280, 16);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.drawImage(qrImg, 140, 234, 260, 260);

  // Pass Code
  ctx.fillStyle = accent;
  ctx.font = 'bold 18px monospace';
  ctx.fillText(pass.passCode, canvas.width / 2, 536);

  // Details block
  ctx.fillStyle = SABIS_CREAM;
  ctx.beginPath();
  ctx.roundRect(46, 554, canvas.width - 92, 82, 12);
  ctx.fill();
  ctx.strokeStyle = SABIS_STONE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = SABIS_INK;
  ctx.font = 'bold 13px Roboto, Arial, sans-serif';
  ctx.fillText(`Venue: ${registration.assignedGate}`, canvas.width / 2, 578);

  const schoolDisplay =
    registration.schoolType === 'sabis_isc'
      ? registration.schoolBranch
      : registration.schoolOther;
  ctx.fillStyle = SABIS_MUTED;
  ctx.font = '12px Roboto, Arial, sans-serif';
  if (schoolDisplay) {
    ctx.fillText(schoolDisplay.slice(0, 62), canvas.width / 2, 600);
  }
  ctx.fillText(
    [registration.phone, registration.email].filter(Boolean).join('  •  ') || 'Registered Guest',
    canvas.width / 2,
    622
  );

  ctx.fillStyle = SABIS_MUTED;
  ctx.font = '11px Roboto, Arial, sans-serif';
  ctx.fillText(
    'Single-use entry QR pass — Present to Gate Control staff at venue entrance',
    canvas.width / 2,
    662
  );

  const link = document.createElement('a');
  const safeName = (pass.attendeeLabel || registration.name || 'Pass').replace(/[^a-z0-9]/gi, '_');
  link.download = `SABIS_${pass.passCode}_${safeName}.png`;
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

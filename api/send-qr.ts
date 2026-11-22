import type { IncomingMessage, ServerResponse } from 'http';

interface PassPayload {
  passCode: string;
  passIndex: number;
  totalPasses: number;
  attendeeLabel: string;
  qrDataUrl?: string;
}

interface SendQrRequest {
  eventTitle: string;
  recipientEmail?: string;
  recipientPhone?: string;
  parentName: string;
  parentNumber?: string;
  venueName: string;
  tier: string;
  channel: 'email' | 'phone' | 'both';
  passes: PassPayload[];
}

function readJsonBody(req: IncomingMessage): Promise<SendQrRequest> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const passes = Array.isArray(body.passes) ? body.passes : [];
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'SABIS Events <onboarding@resend.dev>';

    if (passes.length === 0) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: 'No QR passes provided' }));
      return;
    }

    const emailHtml = `
      <div style="font-family:Roboto,Helvetica,Arial,sans-serif;background:#F7F4F2;color:#26211E;padding:28px;border-radius:16px;max-width:640px;margin:0 auto;border:1px solid #E3DBD3;">
        <div style="border-bottom:3px solid #016836;padding-bottom:16px;margin-bottom:18px;text-align:center;">
          <img src="https://www.sabis.net/images/sabis-logo.svg" alt="SABIS®" height="36" style="display:inline-block;margin-bottom:10px;" />
          <h2 style="margin:0;color:#016836;font-size:20px;">${escapeHtml(body.eventTitle || 'SABIS® Event Pass')}</h2>
        </div>
        <p style="margin:0 0 18px;color:#7B6E65;font-size:14px;line-height:1.6;">
          Dear <strong style="color:#26211E;">${escapeHtml(body.parentName || 'Guest')}</strong>, your registration is confirmed for
          <strong style="color:#016836;">${escapeHtml(body.venueName)}</strong> (${escapeHtml(body.tier)}).
          Below are your <strong>${passes.length}</strong> individual entry QR pass${passes.length > 1 ? 'es' : ''}. Each attendee must present their unique QR code at the gate.
        </p>
        ${passes
          .map(
            (p) => `
          <div style="background:#FFFFFF;border:1px solid #E3DBD3;border-top:4px solid #016836;border-radius:12px;padding:18px;margin-bottom:14px;text-align:center;">
            <div style="font-size:12px;font-weight:700;color:#016836;text-transform:uppercase;letter-spacing:0.06em;">Pass ${p.passIndex} of ${p.totalPasses}</div>
            <div style="font-size:16px;font-weight:700;color:#26211E;margin:4px 0 10px;">${escapeHtml(p.attendeeLabel || body.parentName)}</div>
            ${p.qrDataUrl ? `<img src="${p.qrDataUrl}" alt="QR ${escapeHtml(p.passCode)}" width="196" height="196" style="background:#FFFFFF;padding:8px;border-radius:10px;border:1px solid #E3DBD3;" />` : ''}
            <div style="font-family:monospace;font-size:13px;font-weight:700;color:#016836;margin-top:8px;">${escapeHtml(p.passCode)}</div>
          </div>
        `
          )
          .join('')}
        <p style="font-size:12px;color:#7B6E65;margin-top:16px;text-align:center;">
          SABIS® Event Management System • Single-use QR verification at venue entrance
        </p>
      </div>
    `;

    let emailSent = false;
    let providerNote = 'Recorded in dispatch log (configure RESEND_API_KEY in Vercel to enable live automated email delivery).';

    if (resendApiKey && body.recipientEmail && (body.channel === 'email' || body.channel === 'both')) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [body.recipientEmail],
          subject: `Your ${passes.length} SABIS® Entry QR Pass${passes.length > 1 ? 'es' : ''} — ${body.eventTitle}`,
          html: emailHtml,
        }),
      });

      if (response.ok) {
        emailSent = true;
        providerNote = `Delivered ${passes.length} SABIS® QR pass(es) via email to ${body.recipientEmail}`;
      } else {
        const errText = await response.text();
        providerNote = `Email provider returned ${response.status}: ${errText}`;
      }
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        dispatchedCount: passes.length,
        emailSent,
        phoneQueued: Boolean(body.recipientPhone && (body.channel === 'phone' || body.channel === 'both')),
        message: providerNote,
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Unexpected dispatch error' }));
  }
}

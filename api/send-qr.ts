import type { IncomingMessage, ServerResponse } from 'http';
import nodemailer from 'nodemailer';

interface PassPayload {
  passCode: string;
  passIndex: number;
  totalPasses: number;
  attendeeLabel: string;
  qrDataUrl?: string;
}

interface SendQrRequest {
  testOnly?: boolean;
  eventTitle?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  parentName?: string;
  parentNumber?: string;
  venueName?: string;
  tier?: string;
  channel?: 'email' | 'phone' | 'both';
  passes?: PassPayload[];
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

function extractBase64Png(dataUrl?: string): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  return Buffer.from(parts[1], 'base64');
}

function getEmailConfig() {
  const gmailUser = (process.env.GMAIL_USER || process.env.SMTP_USER || 'hsdaou@gmail.com').trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const resendFrom = (process.env.RESEND_FROM_EMAIL || 'SABIS Events <onboarding@resend.dev>').trim();

  if (gmailUser && gmailPass) {
    return {
      configured: true,
      provider: 'gmail_smtp' as const,
      senderEmail: gmailUser,
      gmailUser,
      gmailPass,
      smtpHost,
      smtpPort,
      resendApiKey,
      resendFrom,
    };
  }
  if (resendApiKey) {
    return {
      configured: true,
      provider: 'resend' as const,
      senderEmail: resendFrom,
      gmailUser,
      gmailPass,
      smtpHost,
      smtpPort,
      resendApiKey,
      resendFrom,
    };
  }
  return {
    configured: false,
    provider: 'none' as const,
    senderEmail: gmailUser,
    gmailUser,
    gmailPass,
    smtpHost,
    smtpPort,
    resendApiKey,
    resendFrom,
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  const cfg = getEmailConfig();

  // Health-check endpoint so Control Dashboard knows if live email delivery is configured
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        configured: cfg.configured,
        provider: cfg.provider,
        senderEmail: cfg.senderEmail,
      })
    );
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, emailSent: false, error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const recipientEmail = (body.recipientEmail || '').trim();

    if (!cfg.configured) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: false,
          emailSent: false,
          provider: 'none',
          error:
            'Email sender not configured yet. Add GMAIL_USER (hsdaou@gmail.com) and GMAIL_APP_PASSWORD in Vercel Environment Variables and Redeploy.',
        })
      );
      return;
    }

    if (!recipientEmail) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: false,
          emailSent: false,
          provider: cfg.provider,
          error:
            'No recipient email address was entered. Enable "Register Email" (and mark it Required) in Control Dashboard to send QR codes by email.',
        })
      );
      return;
    }

    const passes = Array.isArray(body.passes) ? body.passes : [];
    const eventTitle = body.eventTitle || 'SABIS® Event Pass';
    const parentName = body.parentName || 'Guest';
    const venueName = body.venueName || 'Main Campus Entrance';
    const tier = body.tier || 'Parent';

    // Build inline CID attachments for Gmail / Outlook / Apple Mail compatibility
    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
      cid: string;
    }> = [];

    passes.forEach((p) => {
      const buf = extractBase64Png(p.qrDataUrl);
      if (buf) {
        attachments.push({
          filename: `SABIS_${p.passCode}.png`,
          content: buf,
          contentType: 'image/png',
          cid: `qr-pass-${p.passIndex}@sabis-events`,
        });
      }
    });

    const isTest = Boolean(body.testOnly);
    const subject = isTest
      ? `SABIS® Event System — Test Email Confirmation`
      : `Your ${passes.length} SABIS® Entry QR Pass${passes.length > 1 ? 'es' : ''} — ${eventTitle}`;

    const htmlBody = isTest
      ? `
        <div style="font-family:Roboto,Helvetica,Arial,sans-serif;background:#F7F4F2;color:#26211E;padding:28px;border-radius:16px;max-width:560px;margin:0 auto;border:1px solid #E3DBD3;">
          <div style="border-bottom:3px solid #016836;padding-bottom:14px;margin-bottom:16px;text-align:center;">
            <h2 style="margin:0;color:#016836;">SABIS® Event Management System</h2>
          </div>
          <p style="font-size:14px;color:#26211E;line-height:1.6;">
            Live email delivery is working! Entry QR codes will be sent automatically from <strong>${escapeHtml(cfg.senderEmail)}</strong> whenever invitees register while <em>"Send QR to Registered Contact Info"</em> mode is active.
          </p>
        </div>
      `
      : `
        <div style="font-family:Roboto,Helvetica,Arial,sans-serif;background:#F7F4F2;color:#26211E;padding:28px;border-radius:16px;max-width:640px;margin:0 auto;border:1px solid #E3DBD3;">
          <div style="border-bottom:3px solid #016836;padding-bottom:16px;margin-bottom:18px;text-align:center;">
            <h2 style="margin:0;color:#016836;font-size:21px;">SABIS® Event Entry Pass</h2>
            <p style="margin:6px 0 0;color:#26211E;font-size:15px;font-weight:700;">${escapeHtml(eventTitle)}</p>
          </div>
          <p style="margin:0 0 18px;color:#7B6E65;font-size:14px;line-height:1.6;">
            Dear <strong style="color:#26211E;">${escapeHtml(parentName)}</strong>, your registration is confirmed for
            <strong style="color:#016836;">${escapeHtml(venueName)}</strong> (${escapeHtml(tier)}).
            Below are your <strong>${passes.length}</strong> individual entry QR pass${passes.length > 1 ? 'es' : ''}. Each attendee must present their unique QR code at the venue entrance.
          </p>
          ${passes
            .map(
              (p) => `
            <div style="background:#FFFFFF;border:1px solid #E3DBD3;border-top:4px solid ${tier === 'VIP' ? '#8A6D3B' : '#016836'};border-radius:12px;padding:18px;margin-bottom:14px;text-align:center;">
              <div style="font-size:12px;font-weight:700;color:${tier === 'VIP' ? '#8A6D3B' : '#016836'};text-transform:uppercase;letter-spacing:0.06em;">Pass ${p.passIndex} of ${p.totalPasses}</div>
              <div style="font-size:16px;font-weight:700;color:#26211E;margin:4px 0 12px;">${escapeHtml(p.attendeeLabel || parentName)}</div>
              ${
                p.qrDataUrl
                  ? `<img src="cid:qr-pass-${p.passIndex}@sabis-events" alt="QR ${escapeHtml(p.passCode)}" width="210" height="210" style="display:inline-block;background:#FFFFFF;padding:8px;border-radius:10px;border:2px solid #016836;" />`
                  : ''
              }
              <div style="font-family:monospace;font-size:14px;font-weight:700;color:#016836;margin-top:10px;">${escapeHtml(p.passCode)}</div>
            </div>
          `
            )
            .join('')}
          <p style="font-size:12px;color:#7B6E65;margin-top:16px;text-align:center;">
            SABIS® Event Management System • Single-use QR verification at venue entrance
          </p>
        </div>
      `;

    if (cfg.provider === 'gmail_smtp') {
      const transporter = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort,
        secure: cfg.smtpPort === 465,
        auth: {
          user: cfg.gmailUser,
          pass: cfg.gmailPass,
        },
      });

      await transporter.sendMail({
        from: `"SABIS® Events" <${cfg.gmailUser}>`,
        to: recipientEmail,
        subject,
        html: htmlBody,
        attachments,
      });

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          emailSent: true,
          provider: 'gmail_smtp',
          sender: cfg.gmailUser,
          dispatchedCount: passes.length,
          message: isTest
            ? `Test email delivered to ${recipientEmail} from ${cfg.gmailUser}!`
            : `Sent ${passes.length} SABIS® QR pass(es) to ${recipientEmail} from ${cfg.gmailUser}.`,
        })
      );
      return;
    }

    // Fallback: Resend API
    const resendAttachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString('base64'),
    }));

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.resendFrom,
        to: [recipientEmail],
        subject,
        html: htmlBody,
        attachments: resendAttachments,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: false,
          emailSent: false,
          provider: 'resend',
          error: `Resend rejected email (${response.status}): ${errText}`,
        })
      );
      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        emailSent: true,
        provider: 'resend',
        sender: cfg.resendFrom,
        dispatchedCount: passes.length,
        message: isTest
          ? `Test email delivered to ${recipientEmail}!`
          : `Sent ${passes.length} SABIS® QR pass(es) to ${recipientEmail}.`,
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        ok: false,
        emailSent: false,
        error: err instanceof Error ? err.message : 'Unexpected email dispatch error',
      })
    );
  }
}

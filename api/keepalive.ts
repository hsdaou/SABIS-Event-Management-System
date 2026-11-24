import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const supabaseKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !supabaseKey) {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: false,
        skipped: true,
        timestamp: new Date().toISOString(),
        message: 'Supabase environment variables are not configured on Vercel.',
      })
    );
    return;
  }

  try {
    const pingUrl = `${supabaseUrl}/rest/v1/events?select=id&limit=1`;
    const response = await fetch(pingUrl, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const ok = response.ok;
    res.statusCode = ok ? 200 : 502;
    res.end(
      JSON.stringify({
        ok,
        status: response.status,
        timestamp: new Date().toISOString(),
        message: ok
          ? 'Supabase keep-alive ping succeeded.'
          : `Supabase responded with HTTP ${response.status}.`,
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        ok: false,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Ping failed',
      })
    );
  }
}

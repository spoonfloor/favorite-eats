import bcrypt from 'npm:bcryptjs@2.4.3';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function passwordMatchesHash(password: string, hash: string) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch (err) {
    console.error('Password hash compare failed:', err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed.' });
  }

  const configuredHash = String(Deno.env.get('SPLASH_PASSWORD_HASH') || '').trim();
  const demoHash = String(Deno.env.get('SPLASH_DEMO_PASSWORD_HASH') || '').trim();
  if (!configuredHash && !demoHash) {
    return jsonResponse(500, { ok: false, error: 'Password gate is not configured.' });
  }

  let password = '';
  try {
    const body = await req.json();
    password = String(body?.password || '');
  } catch (_) {
    return jsonResponse(400, { ok: false, error: 'Invalid request payload.' });
  }

  if (!password) {
    return jsonResponse(400, { ok: false, error: 'Password is required.' });
  }

  if (configuredHash && (await passwordMatchesHash(password, configuredHash))) {
    return jsonResponse(200, { ok: true, mode: 'full' });
  }

  if (demoHash && (await passwordMatchesHash(password, demoHash))) {
    return jsonResponse(200, { ok: true, mode: 'demo' });
  }

  return jsonResponse(401, { ok: false, error: 'Invalid password.' });
});

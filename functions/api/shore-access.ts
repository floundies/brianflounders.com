interface Env {
  SHORE_ACCESS_WORD: string;
  SHORE_ACCESS_TOKEN_SECRET?: string;
  SHORE_WIFI_SSID?: string;
  SHORE_WIFI_PASSWORD?: string;
  SHORE_BEACH_BOX?: string;
  SHORE_ADDRESS?: string;
  SHORE_TRASH_RECYCLING?: string;
  SHORE_TRASH_ONLY?: string;
}

const COOKIE_NAME = 'shore_access';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const cookies = header.split(';').map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

async function hmac(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function createToken(env: Env): Promise<string> {
  const issuedAt = String(Date.now());
  const signature = await hmac(issuedAt, env.SHORE_ACCESS_TOKEN_SECRET || env.SHORE_ACCESS_WORD);
  return `${issuedAt}.${signature}`;
}

async function isValidToken(token: string | null, env: Env): Promise<boolean> {
  if (!token) return false;
  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature) return false;

  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_SECONDS * 1000) return false;

  const expected = await hmac(issuedAt, env.SHORE_ACCESS_TOKEN_SECRET || env.SHORE_ACCESS_WORD);
  return signature === expected;
}

function getHouseDetails(env: Env) {
  return [
    ['Wi-Fi', [env.SHORE_WIFI_SSID, env.SHORE_WIFI_PASSWORD].filter(Boolean).join(' / ')],
    ['Trash and recycling', env.SHORE_TRASH_RECYCLING || 'Monday morning. Do not use a bag for recycling.'],
    ['Trash only', env.SHORE_TRASH_ONLY || 'Thursday morning.'],
    ['Lavender beach box', env.SHORE_BEACH_BOX || ''],
    ['Address', env.SHORE_ADDRESS || ''],
  ].filter(([, value]) => value);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SHORE_ACCESS_WORD) {
    return json({ ok: false, error: 'Shore access is not configured.' }, { status: 500 });
  }

  const token = getCookie(request, COOKIE_NAME);
  if (!(await isValidToken(token, env))) {
    return json({ ok: false, error: 'Not unlocked.' }, { status: 401 });
  }

  return json({ ok: true, houseDetails: getHouseDetails(env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SHORE_ACCESS_WORD) {
    return json({ ok: false, error: 'Shore access is not configured.' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({})) as { word?: string };
  const word = (body.word || '').trim().toLowerCase();
  const expected = env.SHORE_ACCESS_WORD.trim().toLowerCase();

  if (word !== expected) {
    return json({ ok: false, error: 'Try the shore word.' }, { status: 401 });
  }

  const token = await createToken(env);
  return json(
    { ok: true, houseDetails: getHouseDetails(env) },
    {
      headers: {
        'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
      },
    },
  );
};

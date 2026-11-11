// Guldberglia Gourmet – offentlig API (Neon Function «gourmetapi»).
// Leser menyer og lagrer gjestevurderinger. Alle spørringer er faste SQL-funksjoner
// i databasen (api_*), så API-et kan ikke brukes til å lese noe annet.

const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

let sqlEndpoint = null;
function endpointCandidates() {
  const host = new URL(DATABASE_URL).hostname;
  return [...new Set([
    `https://${host}/sql`,
    `https://${host.replace('-pooler.', '.')}/sql`,
    `https://${host.replace(/^[^.]+\./, 'api.')}/sql`,
  ])];
}

async function sql(query, params = []) {
  const candidates = sqlEndpoint ? [sqlEndpoint] : endpointCandidates();
  let lastErr;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DATABASE_URL },
        body: JSON.stringify({ query, params }),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = new Error(text.slice(0, 400));
        lastErr.status = res.status;
        if (res.status === 400 && /message/.test(text)) throw lastErr;
        continue;
      }
      sqlEndpoint = url;
      return JSON.parse(text).rows;
    } catch (e) {
      lastErr = e;
      if (sqlEndpoint || e.status === 400) break;
    }
  }
  throw lastErr;
}

function cors(origin) {
  const allow = ALLOWED_ORIGIN === '*'
    ? '*'
    : (ALLOWED_ORIGIN.split(',').map((s) => s.trim()).includes(origin) || /\.(netlify\.app|github\.io)$/.test(origin || '') ? origin : ALLOWED_ORIGIN.split(',')[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, headers, cache) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache || 'no-store',
    },
  });
}

const ERRORS = {
  ugyldig_stjerner: 'Velg mellom en halv og fem stjerner.',
  ugyldig_klient: 'Ugyldig forespørsel.',
  ukjent_meny: 'Fant ikke menyen.',
  ukjent_rett: 'Fant ikke retten.',
  ukjent_vin: 'Fant ikke vinen.',
  for_mange: 'Litt for mange vurderinger på kort tid – prøv igjen om et øyeblikk.',
};

async function route(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const h = cors(request.headers.get('origin'));

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

  if (request.method === 'GET') {
    if (path === '/' || path === '/health') return json({ ok: true, service: 'gourmetapi' }, 200, h);
    if (path === '/today') {
      const [r] = await sql('SELECT api_today() AS d');
      return json(r.d, 200, h, 'public, max-age=30');
    }
    if (path === '/upcoming') {
      const [r] = await sql('SELECT api_upcoming() AS d');
      return json(r.d, 200, h, 'public, max-age=60');
    }
    if (path === '/archive') {
      const [r] = await sql('SELECT api_archive() AS d');
      return json(r.d, 200, h, 'public, max-age=60');
    }
    if (path === '/drunk') {
      const [r] = await sql('SELECT api_drunk() AS d');
      return json(r.d, 200, h, 'public, max-age=60');
    }
    const m = path.match(/^\/menu\/(\d{1,9})$/);
    if (m) {
      const [r] = await sql('SELECT api_menu_json($1::bigint) AS d', [m[1]]);
      return r.d ? json(r.d, 200, h, 'public, max-age=30') : json({ error: 'Fant ikke menyen.' }, 404, h);
    }
    if (path === '/mine') {
      const client = url.searchParams.get('client') || '';
      const menu = url.searchParams.get('menu') || '';
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(client) || !/^\d{1,9}$/.test(menu)) return json({}, 200, h);
      const [r] = await sql('SELECT api_my_ratings($1, $2::bigint) AS d', [client, menu]);
      return json(r.d, 200, h);
    }
  }

  if (request.method === 'POST' && path === '/rate') {
    let b;
    try { b = await request.json(); } catch { return json({ error: 'Ugyldig forespørsel.' }, 400, h); }
    const menuId = Number.parseInt(b?.menu_id, 10);
    const courseId = b?.course_id == null || b.course_id === '' ? null : Number.parseInt(b.course_id, 10);
    const pairingId = b?.pairing_id == null || b.pairing_id === '' ? null : Number.parseInt(b.pairing_id, 10);
    const stars = Math.round(Number.parseFloat(b?.stars) * 2) / 2;
    const client = String(b?.client_id || '');
    if (!Number.isFinite(menuId) || (courseId !== null && !Number.isFinite(courseId)) || (pairingId !== null && !Number.isFinite(pairingId)) || !/^[A-Za-z0-9_-]{8,64}$/.test(client)) {
      return json({ error: 'Ugyldig forespørsel.' }, 400, h);
    }
    try {
      const [r] = await sql('SELECT api_rate($1, $2::bigint, $3::bigint, $4::bigint, $5::numeric, $6, $7) AS d', [
        client, String(menuId), courseId === null ? null : String(courseId),
        pairingId === null ? null : String(pairingId), String(stars),
        typeof b.comment === 'string' ? b.comment.slice(0, 500) : null,
        typeof b.guest_name === 'string' ? b.guest_name.slice(0, 60) : null,
      ]);
      return json(r.d, 200, h);
    } catch (e) {
      const key = Object.keys(ERRORS).find((k) => String(e.message).includes(k));
      if (key) return json({ error: ERRORS[key] }, key === 'for_mange' ? 429 : 400, h);
      throw e;
    }
  }

  return json({ error: 'Ikke funnet.' }, 404, h);
}

export default {
  async fetch(request) {
    try {
      return await route(request);
    } catch (e) {
      console.error('gourmetapi feil:', String(e?.message || e).slice(0, 500));
      return json({ error: 'Noe gikk galt. Prøv igjen.' }, 500, cors(request.headers.get('origin')));
    }
  },
};

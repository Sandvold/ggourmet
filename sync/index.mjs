// ctsync – henter kjellerbeholdningen fra CellarTracker og oppdaterer Neon.
// Kjøres av en ukentlig Neon Function Trigger (POST /).
// Brukernavn/passord leses fra tabellen ct_credentials – aldri fra kode eller logg.

const DATABASE_URL = process.env.DATABASE_URL;

// --- SQL over HTTP mot Neon (ingen avhengigheter) ---------------------------
let sqlEndpoint = null;

function endpointCandidates() {
  const host = new URL(DATABASE_URL).hostname;
  const list = [
    `https://${host}/sql`,
    `https://${host.replace('-pooler.', '.')}/sql`,
    `https://${host.replace(/^[^.]+\./, 'api.')}/sql`,
  ];
  return [...new Set(list)];
}

async function sql(query, params = []) {
  const candidates = sqlEndpoint ? [sqlEndpoint] : endpointCandidates();
  let lastErr;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Neon-Connection-String': DATABASE_URL,
          'Neon-Raw-Text-Output': 'false',
        },
        body: JSON.stringify({ query, params }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
        // 4xx fra databasen (f.eks. SQL-feil) skal ikke prøves på neste endepunkt
        if (res.status === 400 && /message/.test(text)) throw lastErr;
        continue;
      }
      sqlEndpoint = url;
      return JSON.parse(text).rows;
    } catch (e) {
      lastErr = e;
      if (sqlEndpoint) break;
    }
  }
  throw lastErr;
}

// --- CSV ---------------------------------------------------------------------
function decode(buf) {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(rows) {
  if (rows.length === 0) return { header: [], items: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const items = rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { if (h) o[h] = (r[i] ?? '').trim(); });
    return o;
  });
  return { header, items };
}

// --- Synk ----------------------------------------------------------------------
async function fetchTable(table, handle, password, required) {
  const qs = new URLSearchParams({ User: handle, Password: password, Format: 'csv', Table: table });
  // URL-en inneholder passordet – logges aldri.
  const res = await fetch(`https://www.cellartracker.com/xlquery.asp?${qs}`, {
    headers: { 'User-Agent': 'mat-og-vin-sync/1.0' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`CellarTracker (${table}) svarte ${res.status}`);
  const text = decode(await res.arrayBuffer());
  const { header, items } = toObjects(parseCsv(text));
  if (!required(header)) {
    const hint = /<html|login|password/i.test(text.slice(0, 2000))
      ? 'ser ut som innloggingsside – feil brukernavn/passord?'
      : `uventet format, første kolonner: ${header.slice(0, 8).join(', ')}`;
    // Diagnose uten hemmeligheter: status, type og starten av svaret med brukernavn/passord maskert.
    const mask = (x) => x.split(password).join('***').split(encodeURIComponent(password)).join('***')
      .split(handle).join('<bruker>');
    const snippet = mask(text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 600);
    throw new Error(`CellarTracker-eksporten ${table} har feil format (${hint}) | status=${res.status} type=${res.headers.get('content-type')} lengde=${text.length} | svar: ${snippet}`);
  }
  return { header, items };
}

async function runSync(reason) {
  const creds = await sql('SELECT handle, password FROM ct_credentials WHERE id = 1');
  if (!creds.length) throw new Error('Mangler innlogging i ct_credentials');
  const { handle, password } = creds[0];

  // 1) Beholdning
  const inv = await fetchTable('Inventory', handle, password,
    (h) => h.includes('iwine') && (h.includes('barcode') || h.includes('iinventory')));
  const [r1] = await sql('SELECT ct_sync_inventory($1::jsonb) AS result', [JSON.stringify(inv.items)]);
  const result = r1.result;
  console.log(`ctsync ${reason}: ${inv.items.length} flasker lest, resultat ${JSON.stringify(result)}`);

  const details = { inventory: result };
  await sql('UPDATE sync_runs SET details = $1::jsonb WHERE id = $2::bigint', [JSON.stringify(details), String(result.run_id)]);
  return { ok: true, read: inv.items.length, result, details };
}

async function handle(reason) {
  try {
    return Response.json(await runSync(reason));
  } catch (e) {
    const msg = String(e?.message || e);
    console.error(`ctsync ${reason} FEILET: ${msg}`);
    try { await sql('SELECT ct_log_error($1)', [msg]); } catch {}
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('ctsync', { status: 200 });
    }
    // Neon fjerner X-Neon-*-headere satt av klienter, så denne headeren betyr at kallet kom fra en Neon-trigger.
    const inv = request.headers.get('x-neon-trigger-invocation-id');
    if (!inv) return Response.json({ error: 'not a trigger call' }, { status: 403 });
    let scheduledAt = '';
    try { scheduledAt = (await request.json())?.data?.scheduled_at || ''; } catch {}
    return handle(`trigger ${scheduledAt || inv}`);
  },
};

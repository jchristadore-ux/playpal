// Local mock of The Brovisional ingest endpoint (BROVISIONAL_INGEST.md, final
// spec from OUHS, 2026-10-01), used by
// tests/brovisional.test.mjs and scripts/brovisional-mock.mjs. Verifies the
// HMAC + 300 s window exactly like the real receiver is specified to, and
// implements the posting rules so PlayPal's status mapping is exercised
// end-to-end over real HTTP. Differential math is simplified (AGS = gross).
import { createServer } from 'node:http';
import { verifySignature } from '../../lib/brovisional.mjs';

const r1 = (x) => Math.round(x * 10) / 10;

// linked: ids linked in the (single) mock group; groups: extra group names a
// linked id also posts to (one response entry per group, as the spec says).
export function startMockBrovisional({ secret, linked = ['john', 'tj', 'brian'], groups = {}, port = 0, failNext = 0 } = {}) {
  const store = new Map();          // `${roundId}:${playerId}` -> score
  const requests = [];
  let fail = failNext;
  const linkedSet = new Set(linked);

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const ts = req.headers['x-playpal-timestamp'];
      const sig = req.headers['x-playpal-signature'];
      const v = verifySignature(secret, ts, sig, raw);
      requests.push({ method: req.method, url: req.url, verified: v.ok, reason: v.reason || null, body: raw });
      if (!v.ok) return send(401, { error: 'unauthorized', details: [v.reason === 'stale_timestamp' ? 'timestamp outside the 300s window' : 'bad signature'] });
      if (fail > 0) { fail--; return send(503, { error: 'server_error', retryable: true }); }

      const del = /^\/api\/ingest\/playpal\/([^/]+)$/.exec(req.url || '');
      if (req.method === 'DELETE' && del) {
        const rid = decodeURIComponent(del[1]); let n = 0;
        for (const k of [...store.keys()]) if (k.startsWith(rid + ':')) { store.delete(k); n++; }
        return send(200, { roundId: rid, deleted: n });
      }
      if (req.method !== 'POST' || req.url !== '/api/ingest/playpal') return send(404, { error: 'not found' });

      let card; try { card = JSON.parse(raw); } catch (e) { return send(400, { error: 'invalid_json', details: [String(e.message)] }); }
      const details = [];
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(card.roundId || ''))) details.push('roundId');
      if (!card.date || !/^\d{4}-\d{2}-\d{2}/.test(String(card.date))) details.push('date');
      if (!card.course || String(card.course).length > 100) details.push('course');
      if (card.location != null && String(card.location).length > 120) details.push('location');
      const tee = card.tee || {};
      if (tee.name != null && String(tee.name).length > 40) details.push('tee.name');
      if (tee.rating != null && typeof tee.rating !== 'number') details.push('tee.rating');
      if (tee.slope != null && !Number.isInteger(tee.slope)) details.push('tee.slope');
      const n = Array.isArray(card.holes) ? card.holes.length : 0;
      if (n !== 9 && n !== 18) details.push('holes: exactly 9 or 18');
      (card.holes || []).forEach((h, i) => {
        if (h.hole !== i + 1) details.push(`holes[${i}].hole`);
        if (!(Number.isInteger(h.par) && h.par >= 3 && h.par <= 6)) details.push(`holes[${i}].par`);
        if (h.si != null && !Number.isInteger(h.si)) details.push(`holes[${i}].si`);
      });
      if (!Array.isArray(card.players) || card.players.length < 1 || card.players.length > 50) details.push('players: 1-50');
      (card.players || []).forEach((p, i) => {
        if (!p.id || String(p.id).length > 100) details.push(`players[${i}].id`);
        if (p.sourcePlayerIds != null && !(Array.isArray(p.sourcePlayerIds) && p.sourcePlayerIds.every((x) => typeof x === 'string'))) details.push(`players[${i}].sourcePlayerIds`);
        if (!Array.isArray(p.scores) || p.scores.length !== n) details.push(`players[${i}].scores: one per hole`);
        (p.scores || []).forEach((x, j) => { if (x !== null && !(Number.isInteger(x) && x >= 1 && x <= 20)) details.push(`players[${i}].scores[${j}]`); });
        if (p.post != null && typeof p.post !== 'boolean') details.push(`players[${i}].post`);
      });
      if (details.length) return send(400, { error: 'invalid_payload', details });

      const players = card.players.flatMap((p) => {
        const key = `${card.roundId}:${p.id}`;
        const out = { playerId: p.id, name: p.name };
        if (p.post === false) { store.delete(key); return [{ ...out, status: 'skipped', reason: 'opted_out' }]; }
        const link = [p.id, ...(p.sourcePlayerIds || [])].find((x) => linkedSet.has(x));
        if (!link) return [{ ...out, status: 'skipped', reason: 'unlinked' }];
        const s = p.scores || [];
        const done = (a, b) => s.slice(a, b).length === b - a && s.slice(a, b).every((x) => typeof x === 'number');
        const any = (a, b) => s.slice(a, b).some((x) => typeof x === 'number');
        let holes = null;
        if (n === 18 && done(0, 18)) holes = 18;
        else if (n === 18 && done(0, 9) && !any(9, 18)) holes = 9;
        else if (n === 18 && done(9, 18) && !any(0, 9)) holes = 9;
        else if (n === 9 && done(0, 9)) holes = 9;
        if (!holes) return [{ ...out, status: 'skipped', reason: 'incomplete' }];
        if (tee.rating == null || tee.slope == null) return [{ ...out, status: 'skipped', reason: 'missing_rating' }];
        const gross = s.filter((x) => typeof x === 'number').reduce((a, b) => a + b, 0);
        const rating = holes === 9 && (n === 18 || tee.rating > 45) ? tee.rating / 2 : tee.rating;
        const diff = r1((113 / tee.slope) * (gross - rating));
        const existed = store.has(key);
        store.set(key, { gross, diff, holes });
        const posted = { ...out, status: existed ? 'updated' : 'posted', holes, gross, adjustedGross: gross, differential: diff, index: holes === 9 ? null : diff,
          ...(holes === 9 ? { reason: '9-hole score held until 54 holes' } : {}) };
        return [{ ...posted, group: 'Mock Group' }, ...(groups[link] || []).map((g) => ({ ...posted, group: g }))];
      });
      return send(200, { roundId: card.roundId, players });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({
        url: `http://127.0.0.1:${p}/api/ingest/playpal`,
        store, requests,
        link: (id) => linkedSet.add(id),
        failNext: (n) => { fail = n; },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

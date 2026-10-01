/**
 * HTTP glue for the Brovisional sync endpoints (api/handicap/*, api/cron/*).
 * Handlers are built from injectable deps so tests run without Firebase.
 */
import { syncRound, deleteRound, runCron, ingestConfig, isValidGroupId, isValidRoundId, roundsCollection } from './brovisional.mjs';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body); } catch (e) { return null; } }
  return {};
}

/**
 * Caller must hold a Firebase ID token (anonymous is fine) and be in the group.
 * Group membership in PlayPal is capability-based (firebase/firestore.rules:
 * any signed-in user holding the ~130-bit group code may read/write its
 * rounds), so "in the group" = signed in AND the round exists in that group's
 * collection. When the round doc is gone (delete), fall back to the account
 * link: users/{uid}.groupId == groupId or group_meta/{groupId}.ownerUid == uid.
 */
async function authorize(req, deps, { requireDoc }) {
  let decoded;
  try { decoded = await deps.verifyIdToken(req.headers.authorization || req.headers.Authorization || ''); }
  catch (e) { return { code: 401, error: 'Sign-in required' }; }
  const body = parseBody(req);
  if (!body) return { code: 400, error: 'Invalid JSON body' };
  const groupId = String(body.groupId || '').trim().toUpperCase() === 'LEGACY' ? 'LEGACY' : String(body.groupId || '').trim().toUpperCase();
  const roundId = String(body.roundId || '').trim().toUpperCase();
  if (!isValidGroupId(groupId) || !isValidRoundId(roundId)) return { code: 400, error: 'groupId and roundId are required' };
  const db = deps.getFirestore();
  const snap = await db.collection(roundsCollection(groupId)).doc(roundId).get();
  if (snap.exists) return { ok: true, db, groupId, roundId, snap, uid: decoded.uid, body };
  if (requireDoc) return { code: 404, error: 'Round not found in this group' };
  const uid = decoded.uid;
  const [u, gm] = await Promise.all([
    db.collection('users').doc(uid).get().catch(() => null),
    groupId === 'LEGACY' ? null : db.collection('group_meta').doc(groupId).get().catch(() => null),
  ]);
  const member = (u && u.exists && (u.data() || {}).groupId === groupId) || (gm && gm.exists && (gm.data() || {}).ownerUid === uid);
  if (!member) return { code: 403, error: 'Not a member of this group' };
  return { ok: true, db, groupId, roundId, snap: null, uid, body };
}

export function makePostHandler(deps) {
  return async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return res.status(405).json({ error: 'Method not allowed' }); }
    if (!ingestConfig(deps.env || process.env).enabled) return res.status(200).json({ status: 'disabled' });
    try {
      const a = await authorize(req, deps, { requireDoc: true });
      if (!a.ok) return res.status(a.code).json({ error: a.error });
      const r = await syncRound({ db: a.db, groupId: a.groupId, roundId: a.roundId, docSnap: a.snap, env: deps.env || process.env,
        fetchImpl: deps.fetch || fetch, force: !!a.body.retry, source: a.body.retry ? 'retry' : 'save' });
      if (r.status === 'not_completed') return res.status(409).json({ status: 'not_completed', error: 'Round is not finished yet' });
      return res.status(200).json({ status: r.status, brovisional: r.brovisional, throttled: !!r.throttled });
    } catch (e) {
      console.error('[handicap/post]', (e && e.message) || e);
      return res.status(500).json({ error: 'Handicap sync failed' });
    }
  };
}

export function makeDeleteHandler(deps) {
  return async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST' && req.method !== 'DELETE') { res.setHeader('Allow', 'POST, DELETE, OPTIONS'); return res.status(405).json({ error: 'Method not allowed' }); }
    if (!ingestConfig(deps.env || process.env).enabled) return res.status(200).json({ status: 'disabled' });
    try {
      const a = await authorize(req, deps, { requireDoc: false });
      if (!a.ok) return res.status(a.code).json({ error: a.error });
      const r = await deleteRound({ db: a.db, groupId: a.groupId, roundId: a.roundId, env: deps.env || process.env, fetchImpl: deps.fetch || fetch });
      return res.status(r.status === 'failed' && r.retryable ? 502 : 200).json(r);
    } catch (e) {
      console.error('[handicap/delete]', (e && e.message) || e);
      return res.status(500).json({ error: 'Handicap delete failed' });
    }
  };
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the project has
 * a CRON_SECRET env var. Without one the endpoint refuses to run (fail closed).
 */
export function makeCronHandler(deps) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const env = deps.env || process.env;
    const cronSecret = String(env.CRON_SECRET || '').trim();
    if (!cronSecret) return res.status(503).json({ error: 'CRON_SECRET is not set' });
    if ((req.headers.authorization || '') !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
    if (!ingestConfig(env).enabled) return res.status(200).json({ status: 'disabled' });
    try {
      const out = await runCron({ db: deps.getFirestore(), env, fetchImpl: deps.fetch || fetch });
      console.log('[cron/brovisional]', JSON.stringify({ eligible: out.eligible, attempted: out.attempted }));
      return res.status(200).json(out);
    } catch (e) {
      console.error('[cron/brovisional]', (e && e.message) || e);
      return res.status(500).json({ error: 'Cron run failed' });
    }
  };
}

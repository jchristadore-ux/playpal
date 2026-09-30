/**
 * Firebase Admin init for Vercel serverless.
 * Expects FIREBASE_SERVICE_ACCOUNT_JSON = stringified service-account JSON.
 *
 * Uses the modular firebase-admin API (firebase-admin >= 13/14 removed the
 * legacy namespaced `admin.credential` / `admin.apps` / `admin.auth()` surface
 * from the ESM default export).
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

let _app = null;

function getApp() {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length) {
    _app = existing[0];
    return _app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  }
  let sa;
  try {
    sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  _app = initializeApp({ credential: cert(sa) });
  return _app;
}

/**
 * Back-compat facade: callers use getFirebaseAdmin().auth() / .firestore().
 */
export function getFirebaseAdmin() {
  const app = getApp();
  return {
    app,
    auth: () => getAuth(app),
    firestore: () => getAdminFirestore(app),
  };
}

export function getFirestore() {
  return getAdminFirestore(getApp());
}

/**
 * Verify a Firebase ID token from Authorization: Bearer <token>.
 * Returns decoded token { uid, ... } or throws.
 */
export async function verifyIdToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing Authorization Bearer token');
    err.statusCode = 401;
    throw err;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    const err = new Error('Empty Bearer token');
    err.statusCode = 401;
    throw err;
  }
  try {
    return await getFirebaseAdmin().auth().verifyIdToken(token);
  } catch (e) {
    const err = new Error('Invalid Firebase ID token');
    err.statusCode = 401;
    err.cause = e;
    throw err;
  }
}

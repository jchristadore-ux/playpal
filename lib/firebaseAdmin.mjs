/**
 * Firebase Admin init for Vercel serverless.
 * Expects FIREBASE_SERVICE_ACCOUNT_JSON = stringified service-account JSON.
 */
import admin from 'firebase-admin';

let _app = null;

export function getFirebaseAdmin() {
  if (_app) return admin;
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
  if (!admin.apps.length) {
    _app = admin.initializeApp({
      credential: admin.credential.cert(sa),
    });
  } else {
    _app = admin.apps[0];
  }
  return admin;
}

export function getFirestore() {
  return getFirebaseAdmin().firestore();
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

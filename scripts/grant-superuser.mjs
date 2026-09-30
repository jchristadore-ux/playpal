#!/usr/bin/env node
/**
 * Grant PlayPal "superuser" (full access) to an existing Firebase Auth user.
 *
 *   node scripts/grant-superuser.mjs --email someone@example.com            # dry run
 *   node scripts/grant-superuser.mjs --email someone@example.com --confirm  # apply
 *
 * Full access =
 *   - Auth custom claims { admin:true, superuser:true, pro:true } (merged with existing)
 *     · pro     → ProService unlocks every Pro gate (claims are checked first)
 *     · admin   → firestore.rules isAdmin() read/write bypass
 *   - Firestore users/{uid} merge { pro:true, admin:true, proGrantedAt, entitlementKey:'admin_grant' }
 *
 * Never creates an account. The user must sign up in the app first.
 * Credentials: FIREBASE_SERVICE_ACCOUNT_JSON env (stringified JSON) or
 * GOOGLE_APPLICATION_CREDENTIALS / --sa <path> / .secrets/firebase-service-account.json.
 * Claims take effect after sign-out/sign-in or an ID-token refresh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const email = (arg('--email') || '').trim().toLowerCase();
const confirm = process.argv.includes('--confirm');
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/grant-superuser.mjs --email <email> [--confirm] [--sa <service-account.json>]');
  process.exit(2);
}

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const p = arg('--sa') || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.secrets', 'firebase-service-account.json');
  if (!fs.existsSync(p)) throw new Error('No service account found (set FIREBASE_SERVICE_ACCOUNT_JSON or --sa)');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export const SUPERUSER_CLAIMS = { admin: true, superuser: true, pro: true };

async function findUser(auth, wanted) {
  try {
    return await auth.getUserByEmail(wanted);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
  // Case-insensitive fallback: scan all users.
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    const hit = page.users.find(u => (u.email || '').toLowerCase() === wanted);
    if (hit) return hit;
    token = page.pageToken;
  } while (token);
  return null;
}

const sa = loadCredential();
initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

const user = await findUser(auth, email);
if (!user) {
  console.log(`[grant-superuser] No Firebase Auth user for ${email} in project ${sa.project_id}.`);
  console.log('  Sign up in the app with that email first, then rerun this script. (No account was created.)');
  process.exit(1);
}

const claims = { ...(user.customClaims || {}), ...SUPERUSER_CLAIMS };
const at = new Date().toISOString();
const ref = db.collection('users').doc(user.uid);
const snap = await ref.get();
const existing = snap.exists ? snap.data() : {};
const patch = {
  pro: true,
  admin: true,
  proGrantedAt: existing.proGrantedAt || at,
  entitlementKey: existing.entitlementKey || 'admin_grant',
  updatedAt: at,
};
if (!existing.createdAt) patch.createdAt = at;
if (!existing.email && user.email) patch.email = user.email;

console.log(`[grant-superuser] project=${sa.project_id} uid=${user.uid} email=${user.email}`);
console.log('  providers:', user.providerData.map(p => p.providerId).join(',') || '(none)');
console.log('  current claims:', JSON.stringify(user.customClaims || {}));
console.log('  new claims:    ', JSON.stringify(claims));
console.log(`  users/${user.uid} exists=${snap.exists} pro=${existing.pro === true}; merge:`, JSON.stringify(patch));

if (!confirm) {
  console.log('Dry run only. Re-run with --confirm to apply.');
  process.exit(0);
}
await auth.setCustomUserClaims(user.uid, claims);
await ref.set(patch, { merge: true });
const after = await auth.getUser(user.uid);
console.log('Applied. Claims now:', JSON.stringify(after.customClaims || {}));
console.log('Claims take effect after sign-out/sign-in or an ID-token refresh.');
process.exit(0);

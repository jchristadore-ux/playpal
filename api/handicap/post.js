/**
 * POST /api/handicap/post — send a finished round to The Brovisional.
 * Auth: Firebase ID token (Authorization: Bearer …; anonymous OK).
 * Body: { groupId, roundId, retry? }
 * The round is re-read from Firestore with Admin — client card data is never
 * trusted. Result is written to the round doc's `brovisional` field.
 * Returns { status: 'posted'|'partial'|'failed'|'skipped'|'disabled', brovisional }.
 */
import { getFirestore, verifyIdToken } from '../../lib/firebaseAdmin.mjs';
import { makePostHandler } from '../../lib/brovisionalApi.mjs';

export default makePostHandler({ getFirestore, verifyIdToken });

/**
 * POST /api/handicap/delete — remove a round from The Brovisional (round
 * deleted in PlayPal). Auth as /api/handicap/post; when the round doc is
 * already gone the caller must be the group's account owner/member
 * (users/{uid}.groupId or group_meta ownerUid).
 * Body: { groupId, roundId }  ->  { status: 'deleted'|'failed'|'disabled' }
 */
import { getFirestore, verifyIdToken } from '../../lib/firebaseAdmin.mjs';
import { makeDeleteHandler } from '../../lib/brovisionalApi.mjs';

export default makeDeleteHandler({ getFirestore, verifyIdToken });

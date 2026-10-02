/**
 * GET /api/cron/brovisional — daily Vercel Cron backstop (vercel.json).
 * Retries recent finished rounds whose Brovisional post failed or never ran,
 * and re-checks rounds with unlinked players. Capped per run.
 * Auth: Authorization: Bearer $CRON_SECRET (sent by Vercel Cron).
 */
import { getFirestore } from '../../lib/firebaseAdmin.mjs';
import { makeCronHandler } from '../../lib/brovisionalApi.mjs';

export default makeCronHandler({ getFirestore });

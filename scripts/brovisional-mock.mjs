// Run the local Brovisional mock receiver for manual end-to-end checks:
//   PLAYPAL_INGEST_SECRET=<test secret> node scripts/brovisional-mock.mjs [port]
// then point the API at it with BROVISIONAL_INGEST_URL=http://127.0.0.1:<port>/api/ingest/playpal
// Prints each request with whether its HMAC verified. Never use a real secret here.
import { startMockBrovisional } from '../tests/helpers/mockBrovisional.mjs';

const secret = process.env.PLAYPAL_INGEST_SECRET;
if (!secret) { console.error('Set PLAYPAL_INGEST_SECRET (a throwaway test value).'); process.exit(1); }
const m = await startMockBrovisional({ secret, port: Number(process.argv[2]) || 8787 });
console.log('Mock Brovisional listening at', m.url);
setInterval(() => {
  while (m.requests.length) { const r = m.requests.shift(); console.log(r.method, r.url, r.verified ? 'HMAC ok' : 'HMAC FAIL ' + r.reason); }
}, 500);

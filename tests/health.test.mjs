import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const PAYMENT_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
];

function withEnv(env, fn) {
  const saved = {};
  for (const k of PAYMENT_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of PAYMENT_ENV_KEYS) delete process.env[k];
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

async function loadHandler() {
  const url = pathToFileURL(path.join(root, 'api/health.js')).href + '?t=' + Date.now() + Math.random();
  const mod = await import(url);
  return mod.default;
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
  };
}

test('GET /api/health reports all-false when env unset', async () => {
  await withEnv({}, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.paymentsConfigured, false);
    assert.equal(res.body.stripeSecretKey, false);
    assert.equal(res.body.stripePriceId, false);
    assert.equal(res.body.stripeWebhookSecret, false);
    assert.equal(res.body.firebaseAdmin, false);
    const dumped = JSON.stringify(res.body);
    assert.equal(dumped.includes('sk_'), false);
    assert.equal(dumped.includes('whsec_'), false);
    assert.equal(dumped.includes('private_key'), false);
  });
});

test('GET /api/health paymentsConfigured true when all four envs present', async () => {
  await withEnv({
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_PRICE_ID: 'price_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'playpal-sync',
      client_email: 'svc@playpal-sync.iam.gserviceaccount.com',
    }),
  }, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    assert.equal(res.body.paymentsConfigured, true);
    assert.equal(res.body.stripeSecretKey, true);
    assert.equal(res.body.stripePriceId, true);
    assert.equal(res.body.stripeWebhookSecret, true);
    assert.equal(res.body.firebaseAdmin, true);
  });
});

test('GET /api/health rejects non-GET', async () => {
  await withEnv({}, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 405);
  });
});

test('GET /api/health treats invalid firebase JSON as unset', async () => {
  await withEnv({
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_PRICE_ID: 'price_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{not-json',
  }, async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    assert.equal(res.body.firebaseAdmin, false);
    assert.equal(res.body.paymentsConfigured, false);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProGrant,
  evaluateCheckoutCompleted,
  entitlementIdempotencyKey,
  resolveEntitlement,
  featureRequiresPro,
  PRO_PRODUCT,
} from '../lib/entitlement.mjs';
import { loadPlayPal } from './helpers/load.mjs';

test('PRO_PRODUCT is one-time payment', () => {
  assert.equal(PRO_PRODUCT.mode, 'payment');
  assert.equal(PRO_PRODUCT.id, 'playpal_pro');
});

test('buildProGrant requires uid and sets pro:true', () => {
  assert.throws(() => buildProGrant({}), /uid/);
  const g = buildProGrant({
    uid: 'user_1',
    sessionId: 'cs_123',
    customerId: 'cus_1',
    paymentIntentId: 'pi_1',
    grantedAt: '2026-09-08T00:00:00.000Z',
  });
  assert.equal(g.pro, true);
  assert.equal(g.stripeCheckoutSessionId, 'cs_123');
  assert.equal(g.stripeCustomerId, 'cus_1');
  assert.equal(g.stripePaymentIntentId, 'pi_1');
  assert.equal(g.proGrantedAt, '2026-09-08T00:00:00.000Z');
});

test('evaluateCheckoutCompleted grants with client_reference_id', () => {
  const d = evaluateCheckoutCompleted({
    id: 'cs_abc',
    mode: 'payment',
    payment_status: 'paid',
    client_reference_id: 'uid_42',
    customer: 'cus_9',
    payment_intent: 'pi_9',
  });
  assert.equal(d.grant, true);
  assert.equal(d.uid, 'uid_42');
  assert.equal(d.sessionId, 'cs_abc');
  assert.equal(d.customerId, 'cus_9');
  assert.equal(d.paymentIntentId, 'pi_9');
});

test('evaluateCheckoutCompleted reads metadata.firebaseUid fallback', () => {
  const d = evaluateCheckoutCompleted({
    id: 'cs_m',
    mode: 'payment',
    payment_status: 'paid',
    metadata: { firebaseUid: 'uid_meta' },
  });
  assert.equal(d.grant, true);
  assert.equal(d.uid, 'uid_meta');
});

test('evaluateCheckoutCompleted rejects unpaid / missing uid / wrong mode', () => {
  assert.equal(evaluateCheckoutCompleted(null).grant, false);
  assert.equal(evaluateCheckoutCompleted({ mode: 'subscription', payment_status: 'paid', client_reference_id: 'u' }).grant, false);
  assert.equal(evaluateCheckoutCompleted({ mode: 'payment', payment_status: 'unpaid', client_reference_id: 'u' }).grant, false);
  assert.equal(evaluateCheckoutCompleted({ mode: 'payment', payment_status: 'paid' }).reason, 'missing_uid');
});

test('entitlementIdempotencyKey prefers payment intent', () => {
  assert.equal(entitlementIdempotencyKey({ paymentIntentId: 'pi_1', sessionId: 'cs_1' }), 'pi:pi_1');
  assert.equal(entitlementIdempotencyKey({ sessionId: 'cs_1' }), 'cs:cs_1');
  assert.equal(entitlementIdempotencyKey({}), null);
});

test('resolveEntitlement fail-open keeps cached Pro on network error', () => {
  const open = resolveEntitlement({ remote: null, cached: { pro: true }, networkError: true });
  assert.equal(open.pro, true);
  assert.equal(open.source, 'cache_fail_open');

  const remote = resolveEntitlement({ remote: { pro: false }, cached: { pro: true }, networkError: false });
  assert.equal(remote.pro, false);
  assert.equal(remote.source, 'remote');

  const def = resolveEntitlement({ remote: null, cached: null, networkError: false });
  assert.equal(def.pro, false);
});

test('featureRequiresPro covers audit §5.3 keys', () => {
  assert.equal(featureRequiresPro('trips'), true);
  assert.equal(featureRequiresPro('statsHistory'), true);
  assert.equal(featureRequiresPro('scoring'), false);
});

test('browser EntitlementHelpers matches lib helpers', () => {
  const w = loadPlayPal();
  assert.ok(w.EntitlementHelpers);
  const d = w.EntitlementHelpers.evaluateCheckoutCompleted({
    id: 'cs_x', mode: 'payment', payment_status: 'paid', client_reference_id: 'u1',
  });
  assert.equal(d.grant, true);
  assert.equal(d.uid, 'u1');
});

test('GroupService ownerUid link', () => {
  const w = loadPlayPal();
  assert.equal(w.GroupService.ownerUid(), null);
  w.GroupService.setOwnerUid('abc');
  assert.equal(w.GroupService.ownerUid(), 'abc');
});

test('ProService fail-open from cache without firebase', () => {
  const w = loadPlayPal();
  w.localStorage.setItem('pp_pro_entitlement', JSON.stringify({ pro: true, email: 'a@b.c' }));
  w.ProService.bootFromCache();
  assert.equal(w.ProService.isPro(), true);
});

test('firestore rules mention users/{uid} and block self-grant path', async () => {
  const { readFileSync } = await import('node:fs');
  const rules = readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/users\/\{uid\}/);
  assert.match(rules, /request\.resource\.data\.pro == false/);
  assert.match(rules, /group_meta/);
});

test('constructWebhookEvent is exported from stripeClient module shape', async () => {
  // Importing stripeClient without env throws on getStripe(); just assert the
  // module exports the verification helper for the webhook path.
  const mod = await import('../lib/stripeClient.mjs');
  assert.equal(typeof mod.constructWebhookEvent, 'function');
  assert.equal(typeof mod.getStripe, 'function');
});

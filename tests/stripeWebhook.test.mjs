import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {
  evaluateCheckoutCompleted,
  buildProGrant,
  entitlementIdempotencyKey,
} from '../lib/entitlement.mjs';

// Stripe SDK can verify a payload signed with a test secret without network.
const TEST_SECRET = 'whsec_test_playpal_entitlement';

test('Stripe webhook signature verification accepts a valid test payload', () => {
  const stripe = new Stripe('sk_test_placeholder');
  const payload = JSON.stringify({
    id: 'evt_test',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        client_reference_id: 'firebase_uid_1',
        customer: 'cus_test',
        payment_intent: 'pi_test',
        metadata: { firebaseUid: 'firebase_uid_1', product: 'playpal_pro' },
      },
    },
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_SECRET,
  });
  const event = stripe.webhooks.constructEvent(payload, header, TEST_SECRET);
  assert.equal(event.type, 'checkout.session.completed');
  const decision = evaluateCheckoutCompleted(event.data.object);
  assert.equal(decision.grant, true);
  assert.equal(decision.uid, 'firebase_uid_1');
  const grant = buildProGrant(decision);
  assert.equal(grant.pro, true);
  assert.equal(entitlementIdempotencyKey(decision), 'pi:pi_test');
});

test('Stripe webhook signature verification rejects a tampered payload', () => {
  const stripe = new Stripe('sk_test_placeholder');
  const payload = '{"id":"evt_test","object":"event","type":"checkout.session.completed","data":{"object":{}}}';
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_SECRET,
  });
  assert.throws(
    () => stripe.webhooks.constructEvent(payload + ' ', header, TEST_SECRET),
    /Signature|payload|digest|No signatures/i,
  );
});

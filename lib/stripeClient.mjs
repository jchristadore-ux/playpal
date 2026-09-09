/**
 * Stripe client — latest Node SDK patterns:
 *   - single Stripe instance from secret key
 *   - Checkout Sessions without payment_method_types (Dashboard-driven)
 */
import Stripe from 'stripe';

let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  _stripe = new Stripe(key);
  return _stripe;
}

export function getPriceId() {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error('STRIPE_PRICE_ID is not set');
  return id;
}

export function getWebhookSecret() {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return s;
}

/**
 * Construct and verify a webhook event from the raw body + signature header.
 * Separated so unit tests can assert the call shape without a live Stripe.
 */
export function constructWebhookEvent(rawBody, signatureHeader, stripe = null, secret = null) {
  const client = stripe || getStripe();
  const whsec = secret || getWebhookSecret();
  return client.webhooks.constructEvent(rawBody, signatureHeader, whsec);
}

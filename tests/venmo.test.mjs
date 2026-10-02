// Venmo links: https universal links only (never venmo://), encoded, 2-dp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const S = W.SharingService;
const q = url => Object.fromEntries(new URL(url).searchParams);

test('request link: documented venmo.com payment-link shape, txn=charge', () => {
  const r = S.venmoRequest({ from: { name: 'Mike', venmo: 'Mike-Clark' }, to: { name: 'J' }, amount: 15 }, 'PlayPal · Harkers Hollow');
  const u = new URL(r.url);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.host, 'venmo.com');
  assert.equal(u.pathname, '/');
  const p = q(r.url);
  assert.equal(p.txn, 'charge');
  assert.equal(p.recipients, 'Mike-Clark');
  assert.equal(p.amount, '15.00');
  assert.equal(p.note, 'PlayPal · Harkers Hollow');
  assert.ok(!r.url.includes('venmo://'));
});

test('note is URL-encoded (spaces, &, #, ?, emoji, accents)', () => {
  const note = 'Sixes & Skins #1? ⛳ Café · 10/2';
  const r = S.venmoRequest({ from: { venmo: 'x' }, amount: 1 }, note);
  assert.ok(!/[ #]/.test(r.url.split('?')[1]), 'no raw spaces or #');
  assert.equal((r.url.match(/&/g) || []).length, 3, 'the & in the note is encoded');
  assert.equal(q(r.url).note, note);
});

test('@ stripping, whitespace, missing handle', () => {
  assert.equal(S.venmoHandle('@@John-C '), 'John-C');
  assert.equal(S.venmoHandle(' @tj quimby'), 'tjquimby');
  assert.equal(S.venmoRequest({ from: { venmo: '@' }, amount: 5 }), null);
  assert.equal(S.venmoRequest({ from: { venmo: '   ' }, amount: 5 }), null);
  assert.equal(S.venmoRequest({ from: {}, amount: 5 }), null);
});

test('amount: 2 decimals, rounded to the cent, never negative', () => {
  const amt = a => q(S.venmoRequest({ from: { venmo: 'x' }, amount: a }, 'n').url).amount;
  assert.equal(amt(12.5), '12.50');
  assert.equal(amt(7), '7.00');
  assert.equal(amt(3.333), '3.33');
  assert.equal(amt(-4.2), '4.20');
  assert.equal(amt(0.005 + 10), '10.01');
});

test('pay vs charge', () => {
  const debt = { from: { venmo: 'payer' }, to: { venmo: '@winner' }, amount: 20 };
  const pay = S.venmoPay(debt, 'golf');
  assert.equal(q(pay.url).txn, 'pay');
  assert.equal(q(pay.url).recipients, 'winner');
  assert.equal(q(S.venmoRequest(debt, 'golf').url).txn, 'charge');
  assert.equal(q(S.venmoLink({ handle: 'a', amount: 1, txn: 'bogus' })).txn, 'charge');
});

test('openExternal refuses non-https and navigates top-level', () => {
  let went = null;
  const saved = W.location;
  W.location = { assign: u => { went = u; } };
  try {
    assert.equal(S.openExternal('venmo://paycharge?x=1'), false);
    assert.equal(went, null);
    assert.equal(S.openExternal('https://venmo.com/?txn=charge'), true);
    assert.equal(went, 'https://venmo.com/?txn=charge');
    // Capacitor native with the Browser plugin → system open.
    let opened = null;
    W.Capacitor = { isNativePlatform: () => true, Plugins: { Browser: { open: o => { opened = o.url; } } } };
    S.openExternal('https://venmo.com/?txn=pay');
    assert.equal(opened, 'https://venmo.com/?txn=pay');
  } finally { W.location = saved; delete W.Capacitor; }
});

test('no component links to the venmo:// scheme', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../components/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => /\.(js|jsx)$/.test(f))) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/['"`]venmo:\/\//.test(src), f + ' builds a venmo:// link');
  }
});

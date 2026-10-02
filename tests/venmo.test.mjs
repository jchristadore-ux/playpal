// Venmo links: https universal links only (never venmo://), encoded, 2-dp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const S = W.SharingService;
const q = url => Object.fromEntries(new URL(url).searchParams);

test('request link: venmo.com/<user>?txn=charge (the form venmo.com hands to the app)', () => {
  const r = S.venmoRequest({ from: { name: 'Mike', venmo: 'Mike-Clark' }, to: { name: 'J' }, amount: 15 }, 'PlayPal · Harkers Hollow');
  const u = new URL(r.url);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.host, 'venmo.com');
  assert.equal(u.pathname, '/Mike-Clark', 'recipient in the path, not ?recipients= on the root');
  const p = q(r.url);
  assert.equal(p.txn, 'charge');
  assert.equal(p.amount, '15.00');
  assert.equal(p.note, 'PlayPal · Harkers Hollow');
  assert.equal(p.recipients, undefined);
  // Secondary links.
  assert.equal(r.appLink, 'venmo://paycharge?txn=charge&recipients=Mike-Clark&amount=15.00&note=PlayPal%20%C2%B7%20Harkers%20Hollow');
  assert.equal(r.profileLink, 'https://venmo.com/u/Mike-Clark');
  assert.equal(r.copyText, '@Mike-Clark · $15.00 · PlayPal · Harkers Hollow');
});

test('note is URL-encoded (spaces, &, #, ?, emoji, accents)', () => {
  const note = 'Sixes & Skins #1? ⛳ Café · 10/2';
  const r = S.venmoRequest({ from: { venmo: 'x' }, amount: 1 }, note);
  assert.ok(!/[ #]/.test(r.url.split('?')[1]), 'no raw spaces or #');
  assert.equal((r.url.match(/&/g) || []).length, 2, 'the & in the note is encoded');
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
  assert.equal(new URL(pay.url).pathname, '/winner');
  assert.ok(pay.appLink.includes('txn=pay&recipients=winner'));
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

test('venmo:// only comes from SharingService.venmoAppLink and is only an explicit anchor', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../components/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => /\.(js|jsx)$/.test(f))) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/['"`]venmo:\/\//.test(src), f + ' hard-codes a venmo:// link');
  }
  const sum = readFileSync(new URL('../components/Summary.jsx', import.meta.url), 'utf8');
  assert.ok(!/location\.(assign|href)\s*=?\s*\(?[^;]*appLink/.test(sum), 'app link is never JS-navigated');
  assert.ok(!/openExternal\(/.test(sum), 'Summary relies on real anchor taps');
  assert.match(sum, /href=\{link\.url\} target="_blank"/);
});

test('round-ended summary: Venmo requests on PAYOUTS (top), SEND, and a SCORES banner', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../components/Summary.jsx', import.meta.url), 'utf8');
  const payouts = src.indexOf("{tab==='payouts' && (");
  assert.ok(payouts > 0 && src.indexOf('{venmoCard}', payouts) - payouts < 200, 'Venmo card leads the PAYOUTS tab');
  assert.ok(src.indexOf('{venmoCard}', src.indexOf("{tab==='actions'")) > 0, 'still on the SEND tab');
  assert.match(src, /data-venmo-banner/);
  assert.match(src, /\[\['scorecard','📊 SCORES'\],\['payouts','💰 PAYOUTS'\]\]/, 'read-only viewers get PAYOUTS too');
});

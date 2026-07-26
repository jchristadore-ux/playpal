// recap.test.mjs — the 2026 recap book, pinned to what the engine says.
//
// scripts/gen-recap.mjs replays the trip and renders a standalone page per
// round, per match and per player, plus the standings, awards and money. The
// generator already refuses to publish if its own points attribution or the
// money balance disagrees with the engine (it throws at import time), so
// importing it is itself an assertion. These tests pin the shape of the book —
// which pages exist, that every page stands alone, and that the headline figures
// on the page are the figures the engine computed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPages } from '../scripts/gen-recap.mjs';

const pages = buildPages();
const byPath = new Map(pages.map(p => [p.path, p.html]));

test('the book contains a page for every round, match, player and ledger', () => {
  for (const rid of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
    assert.ok(byPath.has(`rounds/${rid}.html`), `missing rounds/${rid}.html`);
  }
  for (const pid of ['john', 'brian', 'tj', 'mike']) {
    assert.ok(byPath.has(`players/${pid}.html`), `missing players/${pid}.html`);
  }
  for (const path of ['index.html', 'standings.html', 'awards.html', 'money.html', 'print.html']) {
    assert.ok(byPath.has(path), `missing ${path}`);
  }
  // One page per match actually played: R2's four-ball, R3's side Nassau, the
  // six R5 round-robin matches, and R6's two seeded singles.
  const matches = pages.filter(p => p.path.startsWith('matches/'));
  assert.equal(matches.length, 10);
  assert.ok(byPath.has('matches/r2-four-ball.html'));
  assert.ok(byPath.has('matches/r3-nassau-tj-john.html'));
  assert.ok(byPath.has('matches/r6-championship-john-tj.html'));
  assert.equal(pages.filter(p => p.path.startsWith('matches/r5-rr-')).length, 6);
  assert.equal(pages.length, 25);
});

test('every page is a self-contained document with nothing to fetch', () => {
  for (const { path, html } of pages) {
    assert.match(html, /^<!DOCTYPE html>/, `${path} is not a whole document`);
    assert.match(html, /<title>[^<]+<\/title>/, `${path} has no title`);
    assert.match(html, /<style>/, `${path} has no inlined styles`);
    // No scripts, no stylesheet links, no remote assets — the only external
    // reference a page may hold is the site's own favicon.
    assert.doesNotMatch(html, /<script/i, `${path} pulls in a script`);
    assert.doesNotMatch(html, /rel="stylesheet"/i, `${path} links a stylesheet`);
    assert.doesNotMatch(html, /https?:\/\//i, `${path} references a remote URL`);
  }
});

test('the standings page states the engine’s champion and totals', () => {
  const html = byPath.get('standings.html');
  assert.match(html, /John takes the 2026 Cup/);
  // 18.75 / 15.75 / 12.75 / 8.75 out of 33 — the audited final board.
  for (const total of ['18.75', '15.75', '12.75', '8.75']) {
    assert.ok(html.includes(total), `standings missing ${total}`);
  }
  // The climb: nobody scores on Tuesday, because R1 is flat / stakes-only.
  assert.match(html, /R1 · Minerals Golf Club<\/td><td>0<\/td><td>0<\/td><td>0<\/td><td>0<\/td>/);
});

test('the money page carries the settled bankroll', () => {
  const html = byPath.get('money.html');
  for (const amount of ['+$48.75', '+$17.75', '−$18.25', '−$48.25']) {
    assert.ok(html.includes(amount), `money page missing ${amount}`);
  }
  assert.match(html, /nets to \$0/);
});

test('the awards page reports the awards the engine granted, and the ones it did not', () => {
  const html = byPath.get('awards.html');
  assert.match(html, /Birdie King/);
  assert.match(html, /Par King/);
  assert.match(html, /Bogey God/);
  // No putt was recorded on this trip, so the Flat Stick has no winner — the
  // page must say so rather than crown a 0-putt champion.
  assert.match(html, /Flat Stick[\s\S]{0,220}Not awarded/);
  // Fairways and greens went untracked too: a four-way tie at zero, split.
  assert.match(html, /Iron Man[\s\S]{0,260}John, Brian, TJ &amp; Mike/);
  // The Rock was never called, so its ledger is shown but not settled.
  assert.match(html, /stays off the ledger/);
});

test('a round page carries the whole round: card, games, pops, points, money', () => {
  const html = byPath.get('rounds/r3.html');
  assert.match(html, /Wild Turkey/);
  assert.match(html, /<h2>Wolf<\/h2>/);
  assert.match(html, /<h2>The card<\/h2>/);
  assert.match(html, /<h2>Handicaps and pops<\/h2>/);
  assert.match(html, /<h2>Cup points<\/h2>/);
  assert.match(html, /<h2>The money<\/h2>/);
  // Mike's +10 units won Wolf and the flat $5 a man that came with it.
  assert.match(html, /Wolf — <b>Mike<\/b> <span class="note">\(\+10 units\)/);
  assert.ok(html.includes('+$15'));
  // Side-match money is named for the players, not the ledger's two-letter keys.
  assert.ok(html.includes('TJ v John — the 18'));
  assert.ok(!html.includes('Match tj v jo'));
});

test('a match page walks all 18 holes and settles', () => {
  const html = byPath.get('matches/r6-championship-john-tj.html');
  assert.match(html, /TJ won 4&amp;1/);
  assert.match(html, /11-stroke course-handicap difference/);
  // Hole rows 1..18 are all present in the overall progression.
  const rows = html.match(/<td>(\d+)<\/td><td>\d+<\/td><td>/g) || [];
  assert.ok(rows.length >= 18, `expected at least 18 hole rows, saw ${rows.length}`);
  // $2 Nassau: $2 front, $2 back, $4 on the 18 — all three to TJ.
  assert.ok(html.includes('+$8'));
  assert.match(html, /Singles win/);
});

test('a player page adds up to the player’s engine totals', () => {
  const html = byPath.get('players/john.html');
  assert.match(html, /Handicap index 18/);
  assert.ok(html.includes('18.75'));   // Cup points
  assert.ok(html.includes('+$48.75')); // final bankroll
  assert.match(html, /<h2>Every Cup point<\/h2>/);
  assert.match(html, /<h2>Every dollar<\/h2>/);
  // Six rounds played, each linking back to its own round page.
  for (const rid of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
    assert.ok(html.includes(`href="../rounds/${rid}.html"`), `no link to ${rid}`);
  }
});

test('the print sheet holds every other page and keeps its links working', () => {
  const html = byPath.get('print.html');
  // One sheet per page in the book, minus the cover and the sheet itself.
  assert.equal((html.match(/<section class="sheet">/g) || []).length, pages.length - 2);
  // Rebased for the book's root: no depth-1 links survive on a root-level page.
  assert.ok(!html.includes('href="../rounds/'));
  assert.ok(html.includes('href="rounds/r1.html"'));
  // A link that leaves the book is already correct from here and stays put.
  assert.ok(html.includes('href="../settlement.html"'));
});

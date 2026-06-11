// Generates all PWA / iOS icons from the master logo.
// Run: node scripts/make-icons.mjs   (requires `npm install` first)

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'playpal-logo.png'; // master art (1254×1254)
const BG = '#0E2B20';
mkdirSync('icons', { recursive: true });

const flat = [
  ['icons/apple-touch-icon.png', 180],
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/favicon-32.png', 32],
];

for (const [out, size] of flat) {
  await sharp(SRC).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}

// Maskable icon: logo at 80% inside a brand-color safe zone.
const inner = Math.round(512 * 0.8);
const logo = await sharp(SRC).resize(inner, inner).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: logo, gravity: 'centre' }])
  .png()
  .toFile('icons/icon-512-maskable.png');
console.log('wrote icons/icon-512-maskable.png');

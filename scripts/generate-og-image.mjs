#!/usr/bin/env node
// Renders static/og-image.png (1200x630) — the social/link-preview card used by
// the Open Graph and Twitter meta tags. Re-run after changing the brand mark.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'static/og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;

const icon = await sharp(join(ROOT, 'static/icon.svg'))
	.resize(300, 300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
	.png()
	.toBuffer();

const background =
	Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F8F4EC"/>
      <stop offset="1" stop-color="#ECE3D2"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="${HEIGHT - 10}" width="${WIDTH}" height="10" fill="#3B82F6"/>
  <text x="380" y="284" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="92" font-weight="bold" fill="#221E17">Bissbilanz</text>
  <text x="380" y="348" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="38" fill="#5B5346">Know every bite. Own every goal.</text>
  <text x="380" y="414" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="28" fill="#3B82F6">Web · Android · iPhone · Apple Watch</text>
</svg>`);

const png = await sharp(background)
	.composite([{ input: icon, left: 60, top: 165 }])
	.png({ compressionLevel: 9 })
	.toBuffer();

writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${(png.length / 1024).toFixed(1)} KB)`);

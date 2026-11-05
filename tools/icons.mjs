// Erzeugt die App-Icons aus einer SVG-Vorlage:  node tools/icons.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// iOS rundet die Ecken selbst, die PNGs sind deshalb randlos quadratisch.
const motiv = (rx, skala = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2997ff"/><stop offset="1" stop-color="#0058d0"/></linearGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${skala}) translate(-256 -256)">
    <path d="M104 352 L200 256 L268 306 L408 164" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="408" cy="164" r="30" fill="#fff"/>
  </g>
</svg>`;

writeFileSync('icons/icon.svg', motiv(112) + '\n');

const browser = await chromium.launch();
for (const [datei, groesse, skala] of [['apple-touch-icon', 180, 1], ['icon-192', 192, 1], ['icon-512', 512, 1], ['icon-maskable-512', 512, 0.72]]) {
  const seite = await browser.newPage({ viewport: { width: groesse, height: groesse } });
  await seite.setContent(`<!doctype html><style>*{margin:0}svg{display:block;width:100vw;height:100vh}</style>${motiv(0, skala)}`);
  await seite.screenshot({ path: `icons/${datei}.png` });
  await seite.close();
}
await browser.close();

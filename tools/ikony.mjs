// Generator ikon Angielski AI.
//
// Źródłem jest rysunek SVG poniżej — PNG-i renderuje z niego Chromium, więc
// ikona jest ostra w każdym rozmiarze i da się ją poprawiać jak kod, a nie
// piksel po pikselu. Zastępuje dawny generator w Pythonie, który rysował
// płaski dymek i nie umiał gradientów ani wygładzania krawędzi.
//
// Uruchomienie (potrzebny Chromium i pakiet playwright-core):
//   npm i -g playwright-core
//   node tools/ikony.mjs [ścieżka-do-chromium]
//
// Motyw: dymek rozmowy z falą dźwięku — aplikacja jest do MÓWIENIA,
// a nie do czytania, i ikona ma to mówić od pierwszego spojrzenia.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "icons");

/**
 * Rysunek ikony.
 *   zaokraglenie — promień rogów tła (0 = pełne pole dla ikony maskowalnej)
 *   skala        — ile miejsca zajmuje motyw; ikona maskowalna musi zmieścić
 *                  go w kole o promieniu 40% boku, bo Android przycina resztę
 */
export function rysunek({ zaokraglenie = 112, skala = 1 } = {}) {
  // Wysokości słupków fali: rosną do środka jak głos w połowie zdania
  const slupki = [52, 104, 148, 92, 60];
  const szer = 26;
  const odstep = 44;
  const srodekY = 238;
  const x0 = 256 - odstep * 2;

  const fala = slupki.map((h, i) =>
    `<rect x="${x0 + i * odstep - szer / 2}" y="${srodekY - h / 2}" width="${szer}" height="${h}" rx="${szer / 2}" fill="url(#fala)"/>`
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="tlo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b3d31"/>
      <stop offset=".5" stop-color="#15805f"/>
      <stop offset="1" stop-color="#2dd4a0"/>
    </linearGradient>
    <radialGradient id="blask" cx=".22" cy=".12" r=".9">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".28"/>
      <stop offset=".6" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fala" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1fb584"/>
      <stop offset="1" stop-color="#0f7a5a"/>
    </linearGradient>
    <filter id="cien" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#032a20" flood-opacity=".45"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${zaokraglenie}" fill="url(#tlo)"/>
  <rect width="512" height="512" rx="${zaokraglenie}" fill="url(#blask)"/>
  <g transform="translate(256 256) scale(${skala}) translate(-256 -256)">
    <g filter="url(#cien)">
      <path fill="#ffffff" d="
        M138 118 H374 A50 50 0 0 1 424 168 V308 A50 50 0 0 1 374 358
        H236 L168 414 A8 8 0 0 1 155 408 V358 H138
        A50 50 0 0 1 88 308 V168 A50 50 0 0 1 138 118 Z"/>
    </g>
    ${fala}
    <path fill="#fde68a" d="M404 70 L414 98 L442 108 L414 118 L404 146 L394 118 L366 108 L394 98 Z"/>
  </g>
</svg>`;
}

async function main() {
  const { chromium } = await import("playwright-core");
  const przegladarka = await chromium.launch({
    executablePath: process.argv[2] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server"],
  });

  const warianty = [
    { plik: "ikona-512.png", bok: 512, opcje: { zaokraglenie: 112, skala: 1 } },
    { plik: "ikona-192.png", bok: 192, opcje: { zaokraglenie: 112, skala: 1 } },
    // Maskowalna: pełne tło, motyw w bezpiecznym kole — Android sam przytnie kształt
    { plik: "ikona-maskowalna-512.png", bok: 512, opcje: { zaokraglenie: 0, skala: 0.78 } },
  ];

  for (const w of warianty) {
    const strona = await przegladarka.newPage({ viewport: { width: w.bok, height: w.bok }, deviceScaleFactor: 1 });
    const svg = rysunek(w.opcje).replace('width="512" height="512"', `width="${w.bok}" height="${w.bok}"`);
    await strona.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await strona.screenshot({ path: path.join(KATALOG, w.plik), omitBackground: true, clip: { x: 0, y: 0, width: w.bok, height: w.bok } });
    await strona.close();
    console.log("zapisano", w.plik);
  }

  // Źródło SVG obok PNG-ów — przeglądarki na komputerze biorą je jako ostrą favikonę
  fs.writeFileSync(path.join(KATALOG, "ikona.svg"), rysunek({ zaokraglenie: 112, skala: 1 }));
  console.log("zapisano ikona.svg");

  await przegladarka.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

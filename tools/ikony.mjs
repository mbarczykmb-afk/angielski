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
// Motyw: twarz lektorki Novy (wyrenderowana z tego samego modelu 3D, który
// rozmawia w aplikacji) i dymek z falą dźwięku — aplikacja jest do MÓWIENIA.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const KATALOG = path.join(WEB, "icons");

/**
 * Rysunek ikony.
 *   zaokraglenie — promień rogów tła (0 = pełne pole dla ikony maskowalnej)
 *   skala        — ile miejsca zajmuje motyw; ikona maskowalna musi zmieścić
 *                  go w kole o promieniu 40% boku, bo Android przycina resztę
 */
export function rysunek({ zaokraglenie = 112, skala = 1, twarz = null } = {}) {
  if (twarz) return rysunekZTwarza({ zaokraglenie, skala, twarz });
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

// Ikona z twarzą: Nova na zielonym tle, w rogu biały dymek z falą głosu.
// twarz to PNG (base64) z przezroczystym tłem.
function rysunekZTwarza({ zaokraglenie, skala, twarz }) {
  const slupki = [22, 44, 60, 38, 24];
  const fala = slupki.map((h, i) =>
    `<rect x="${384 + i * 18 - 5}" y="${404 - h / 2}" width="10" height="${h}" rx="5" fill="#15805f"/>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="tlo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b3d31"/>
      <stop offset=".55" stop-color="#15805f"/>
      <stop offset="1" stop-color="#2dd4a0"/>
    </linearGradient>
    <radialGradient id="poswiata" cx=".42" cy=".42" r=".5">
      <stop offset="0" stop-color="#7ef0ff" stop-opacity=".35"/>
      <stop offset="1" stop-color="#7ef0ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="cien" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#032a20" flood-opacity=".5"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${zaokraglenie}" fill="url(#tlo)"/>
  <rect width="512" height="512" rx="${zaokraglenie}" fill="url(#poswiata)"/>
  <g transform="translate(256 256) scale(${skala}) translate(-256 -256)">
    <image href="data:image/png;base64,${twarz}" x="6" y="30" width="500" height="500" filter="url(#cien)"/>
    <g filter="url(#cien)">
      <path fill="#ffffff" d="M372 350 H468 A26 26 0 0 1 494 376 V432 A26 26 0 0 1 468 458
        H412 L384 482 A4 4 0 0 1 377 479 V458 H372 A26 26 0 0 1 346 432 V376 A26 26 0 0 1 372 350 Z"/>
    </g>
    ${fala}
  </g>
</svg>`;
}

// Renderuje Novę tym samym kodem co aplikacja (web/js/android3d.js) —
// uśmiechniętą, z otwartymi oczami, na przezroczystym tle.
async function renderujTwarz(przegladarka) {
  const serwer = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x").pathname;
    if (u === "/twarz.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end('<!doctype html><body style="margin:0;background:transparent"><div id="t" style="width:640px;height:640px"></div>' +
        '<script src="/js/robot3d.js"></script><script src="/js/android3d.js"></script>');
    }
    const plik = path.join(WEB, u);
    if (!plik.startsWith(WEB) || !fs.existsSync(plik)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": u.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
    fs.createReadStream(plik).pipe(res);
  });
  await new Promise((ok) => serwer.listen(0, ok));
  const strona = await przegladarka.newPage({ viewport: { width: 640, height: 640 } });
  await strona.goto(`http://localhost:${serwer.address().port}/twarz.html`);
  await strona.evaluate(async () => {
    const r = await Android3D.utworz(document.getElementById("t"), "lektor");
    r.ustawEmocje("radosc");
    r.ustawStan("czeka");
  });
  // Czas na wygładzenie miny; zrzut robimy między mrugnięciami
  await strona.waitForTimeout(3500);
  const png = await strona.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 640, height: 640 } });
  await strona.close();
  serwer.close();
  return png.toString("base64");
}

async function main() {
  const { chromium } = await import("playwright-core");
  const przegladarka = await chromium.launch({
    executablePath: process.argv[2] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const twarz = await renderujTwarz(przegladarka);

  const warianty = [
    { plik: "ikona-512.png", bok: 512, opcje: { zaokraglenie: 112, skala: 1, twarz } },
    { plik: "ikona-192.png", bok: 192, opcje: { zaokraglenie: 112, skala: 1, twarz } },
    // Maskowalna: pełne tło, motyw w bezpiecznym kole — Android sam przytnie kształt
    { plik: "ikona-maskowalna-512.png", bok: 512, opcje: { zaokraglenie: 0, skala: 0.72, twarz } },
  ];

  for (const w of warianty) {
    const strona = await przegladarka.newPage({ viewport: { width: w.bok, height: w.bok }, deviceScaleFactor: 1 });
    const svg = rysunek(w.opcje).replace('width="512" height="512"', `width="${w.bok}" height="${w.bok}"`);
    await strona.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await strona.screenshot({ path: path.join(KATALOG, w.plik), omitBackground: true, clip: { x: 0, y: 0, width: w.bok, height: w.bok } });
    await strona.close();
    console.log("zapisano", w.plik);
  }

  // Favikona SVG (dymek z falą) — lekka i ostra w karcie przeglądarki na komputerze
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

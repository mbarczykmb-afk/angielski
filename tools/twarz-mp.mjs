// Zamienia kanoniczny model twarzy MediaPipe (canonical_face_model.obj,
// licencja Apache 2.0) na lekki plik web/js/vendor/twarz-mediapipe.js,
// z którego android3d.js bierze realistyczne rysy: nos, usta, oczodoły,
// kości policzkowe i brodę.
//
// Uruchomienie:
//   curl -sSLO https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
//   node tools/twarz-mp.mjs canonical_face_model.obj

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const zrodlo = process.argv[2] || "canonical_face_model.obj";
const cel = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "js", "vendor", "twarz-mediapipe.js");

const v = [], f = [];
for (const linia of fs.readFileSync(zrodlo, "utf8").split("\n")) {
  const p = linia.trim().split(/\s+/);
  if (p[0] === "v") v.push(...p.slice(1, 4).map((x) => +(+x).toFixed(3)));
  if (p[0] === "f") f.push(...p.slice(1, 4).map((s) => parseInt(s, 10) - 1));
}

fs.writeFileSync(cel, `/* Kanoniczny model twarzy MediaPipe (468 punktów, 898 trójkątów).
   Źródło: github.com/google-ai-edge/mediapipe —
   mediapipe/modules/face_geometry/data/canonical_face_model.obj
   Copyright Google LLC, licencja Apache 2.0 (pełny tekst: mediapipe.LICENSE).
   Zmiany: zostawione tylko położenia punktów (zaokrąglone do 0,001)
   i trójkąty; bez współrzędnych tekstury. Jednostki: mniej więcej centymetry. */
var TWARZ_MP = {
  v: [${v.join(",")}],
  f: [${f.join(",")}],
};
`);
console.log("zapisano", cel, v.length / 3, "punktów", f.length / 3, "trójkątów");

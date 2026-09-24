// Numer wersji w kodzie strony musi zgadzać się z wersją service workera.
// Inaczej w Ustawieniach widać nie tę wersję, która naprawdę działa.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const katalog = dirname(fileURLToPath(import.meta.url));
const sw = readFileSync(join(katalog, "../sw.js"), "utf8").match(/var WERSJA = "angielski-ai-(v\d+)"/);
const rdzen = readFileSync(join(katalog, "../js/rdzen.js"), "utf8").match(/var WERSJA_APLIKACJI = "(v\d+)"/);

if (!sw || !rdzen || sw[1] !== rdzen[1]) {
  console.log(`✗ wersje się rozjechały: sw.js ${sw && sw[1]}, rdzen.js ${rdzen && rdzen[1]}`);
  process.exit(1);
}
console.log(`✓ wersja aplikacji zgodna z service workerem (${sw[1]})`);

// Testy dat "po ludzku": dziś, jutro, za 3 dni, 24 wrz.
// Daty z bazy są w formacie ISO, a w interfejsie mają brzmieć jak mowa.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const zrodlo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../js/rdzen.js"), "utf8");

function wytnij(nazwa) {
  const poczatek = zrodlo.indexOf("function " + nazwa + "(");
  return zrodlo.slice(poczatek, zrodlo.indexOf("\n}", poczatek) + 2);
}
const miesiace = zrodlo.slice(zrodlo.indexOf("var MIESIACE"), zrodlo.indexOf(";", zrodlo.indexOf("var MIESIACE")) + 1);
const dataLudzka = new Function(miesiace + "\n" + wytnij("dataLudzka") + "\nreturn dataLudzka;")();

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  if (wynik !== oczekiwane) { console.log(`✗ ${nazwa}\n   otrzymano:  ${wynik}\n   oczekiwano: ${oczekiwane}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

const D = "2026-09-24";
sprawdz("ten sam dzień", dataLudzka("2026-09-24", D), "dziś");
sprawdz("jutro", dataLudzka("2026-09-25", D), "jutro");
sprawdz("wczoraj", dataLudzka("2026-09-23", D), "wczoraj");
sprawdz("za kilka dni", dataLudzka("2026-09-28", D), "za 4 dni");
sprawdz("kilka dni temu", dataLudzka("2026-09-21", D), "3 dni temu");
sprawdz("dalej niż tydzień: krótka data", dataLudzka("2026-10-05", D), "5 paź");
// Równo tydzień to już nie "za 7 dni", tylko data — "za 7 dni" brzmi jak liczenie na palcach
sprawdz("tydzień naprzód przez koniec miesiąca", dataLudzka("2026-10-01", D), "1 paź");
sprawdz("inny rok dostaje rok", dataLudzka("2027-01-10", D), "10 sty 2027");
sprawdz("data z godziną", dataLudzka("2026-09-24 18:10", D), "dziś");
sprawdz("przez przełom roku", dataLudzka("2027-01-01", "2026-12-31"), "jutro");
sprawdz("nieczytelna wartość zostaje bez zmian", dataLudzka("coś", D), "coś");
sprawdz("brak wartości to pusty tekst", dataLudzka("", D), "");

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

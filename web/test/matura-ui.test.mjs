// Testy wyświetlania punktacji maturalnej.
//
// Wynik egzaminu to najważniejsza liczba w całym module — musi się zgadzać
// z tym, co przysłał serwer, a kryteria oceniane szacunkowo (wymowa, płynność)
// muszą być jako szacunkowe OZNACZONE. Bez tego uczeń wziąłby je za pewnik.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const katalog = dirname(fileURLToPath(import.meta.url));
const zrodlo = readFileSync(join(katalog, "../js/matura.js"), "utf8");
const rdzen = readFileSync(join(katalog, "../js/rdzen.js"), "utf8");

// Wyciągamy same czyste funkcje — reszta modułu potrzebuje przeglądarki
function wytnij(tekst, nazwa) {
  const poczatek = tekst.indexOf("function " + nazwa + "(");
  if (poczatek < 0) throw new Error("Nie znaleziono funkcji " + nazwa);
  const koniec = tekst.indexOf("\n}", poczatek);
  return tekst.slice(poczatek, koniec + 2);
}

const sandbox = new Function(
  wytnij(rdzen, "esc") + "\n" +
  wytnij(zrodlo, "pasekKryterium") + "\n" +
  "return { esc: esc, pasekKryterium: pasekKryterium };"
)();

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano:  ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

const { pasekKryterium } = sandbox;

// --- Punkty ---

const pelne = pasekKryterium("Zakres struktur", { punkty: 4, maks: 4, uzasadnienie: "Bardzo bogaty zasób." });
sprawdz("punkty pokazane jako ułamek maksimum", pelne.includes("<b>4/4</b>"), true);
sprawdz("pasek wypełniony w 100%", pelne.includes('width:100%'), true);
sprawdz("uzasadnienie trafia do wyniku", pelne.includes("Bardzo bogaty zasób."), true);

const zero = pasekKryterium("Poprawność", { punkty: 0, maks: 4, uzasadnienie: "" });
sprawdz("zero punktów to zero, nie puste pole", zero.includes("<b>0/4</b>"), true);
sprawdz("pasek pusty przy zerze", zero.includes('width:0%'), true);

const polowa = pasekKryterium("Sprawność — zadanie 2", { punkty: 3, maks: 6 });
sprawdz("połowa punktów daje pasek 50%", polowa.includes('width:50%'), true);

// --- Oznaczenie szacunku ---

// Aplikacja nie słyszy nagrania. Ocena wymowy jest domysłem z zapisu mowy
// i uczeń musi to widzieć przy samej ocenie, a nie w przypisie na dole ekranu.
const wymowa = pasekKryterium("Wymowa", { punkty: 1, maks: 2, szacunkowe: true }, "Bez nagrania to domysł.");
sprawdz("kryterium szacunkowe jest oznaczone", wymowa.includes("szacunkowo"), true);
sprawdz("przypis pojawia się przy kryterium", wymowa.includes("Bez nagrania to domysł."), true);

const pewne = pasekKryterium("Płynność", { punkty: 2, maks: 2, szacunkowe: false });
sprawdz("kryterium zmierzone nie jest oznaczane", pewne.includes("szacunkowo"), false);

// --- Przypadki brzegowe ---

sprawdz("brak danych kryterium nic nie rysuje", pasekKryterium("Wymowa", null), "");
sprawdz("maks równy zeru nie dzieli przez zero",
  pasekKryterium("Dziwne", { punkty: 0, maks: 0 }).includes('width:0%'), true);

// Uzasadnienia przychodzą od modelu — muszą przejść przez escapowanie
const zlosliwe = pasekKryterium("Zakres", { punkty: 2, maks: 4, uzasadnienie: '<img src=x onerror="alert(1)">' });
sprawdz("treść od modelu jest escapowana", zlosliwe.includes("<img"), false);
sprawdz("escapowanie zachowuje tekst", zlosliwe.includes("&lt;img"), true);

const zlaEtykieta = pasekKryterium('Wymowa <script>alert("x")</script>', { punkty: 1, maks: 2 });
sprawdz("etykieta też jest escapowana", zlaEtykieta.includes("<script>"), false);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

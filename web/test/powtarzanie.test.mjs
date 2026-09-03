// Testy oceny powtorzenia za wzorem.
// Funkcje zyja w przegladarce, wiec wyciagamy je z pliku i uruchamiamy tutaj —
// logika progu decyduje, czy uczen musi powtarzac fraze, wiec musi byc pewna.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const katalog = dirname(fileURLToPath(import.meta.url));
const zrodlo = readFileSync(join(katalog, "../js/rdzen.js"), "utf8");

const poczatek = zrodlo.indexOf("function naSlowa");
const { naSlowa, podobienstwo } = new Function(
  zrodlo.slice(poczatek) + "\nreturn { naSlowa, podobienstwo };"
)();

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano: ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}
function sprawdzProg(nazwa, powiedziane, wzor, maPrzejsc) {
  const w = podobienstwo(powiedziane, wzor);
  const przeszlo = w >= 0.7;
  if (przeszlo !== maPrzejsc) {
    console.log(`✗ ${nazwa}\n   wynik ${w.toFixed(2)}, przeszlo=${przeszlo}, oczekiwano=${maPrzejsc}`);
    bledy++;
  } else console.log(`✓ ${nazwa} (${w.toFixed(2)})`);
}

const WZOR = "I'd like a coffee, please";

// --- Rozbior na slowa ---
sprawdz("interpunkcja znika", naSlowa("Hello, world!"), ["hello", "world"]);
sprawdz("apostrof zostaje w slowie", naSlowa("I'd like"), ["i'd", "like"]);
sprawdz("wielokrotne spacje", naSlowa("a    b"), ["a", "b"]);
sprawdz("pusty tekst", naSlowa(""), []);

// --- Prog akceptacji ---
sprawdzProg("dokladne powtorzenie", "I'd like a coffee please", WZOR, true);
// Rozpoznawanie mowy notorycznie gubi apostrofy. Uczen powiedzial fraze dobrze,
// wiec ma zaliczyc — inaczej karalibysmy go za usterke mikrofonu.
sprawdzProg("zgubiony apostrof nadal zalicza", "Id like a coffee please", WZOR, true);
sprawdzProg("szum wokol frazy nie przeszkadza", "um I'd like a coffee please yeah", WZOR, true);
sprawdzProg("inna kolejnosc slow", "please I'd like a coffee", WZOR, true);
sprawdzProg("zupelnie inne zdanie", "I want a beer", WZOR, false);
sprawdzProg("cisza", "", WZOR, false);
sprawdzProg("polowa frazy nie wystarcza", "I'd like", WZOR, false);

// Slowo powtorzone przez ucznia nie moze zaliczyc dwoch slow wzoru
sprawdz("kazde slowo liczy sie raz",
  podobienstwo("coffee coffee coffee", "a coffee and a tea") < 0.5, true);

sprawdz("brak wzoru daje zero", podobienstwo("cokolwiek", ""), 0);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

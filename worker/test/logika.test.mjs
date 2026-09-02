import { dzisISO, dataPlus, roznicaDni, bezpieczneJson, tekst, liczba } from "../src/pomoc.js";
import { wyjmijJson } from "../src/ai.js";

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano: ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

// --- Daty ---
sprawdz("dataPlus przez koniec miesiąca", dataPlus("2026-01-31", 1), "2026-02-01");
sprawdz("dataPlus przez rok", dataPlus("2026-12-31", 1), "2027-01-01");
sprawdz("dataPlus rok przestępny", dataPlus("2028-02-28", 1), "2028-02-29");
sprawdz("dataPlus Leitner 32 dni", dataPlus("2026-09-02", 32), "2026-10-04");
sprawdz("roznicaDni wczoraj->dziś", roznicaDni("2026-09-01", "2026-09-02"), 1);
sprawdz("roznicaDni przez miesiąc", roznicaDni("2026-08-31", "2026-09-02"), 2);
sprawdz("roznicaDni ten sam dzień", roznicaDni("2026-09-02", "2026-09-02"), 0);

// Strefa: Polska latem to UTC+2, getTimezoneOffset() zwraca -120
const przedPolnocaUTC = new Date("2026-09-02T22:30:00Z").getTime();
const oryginalny = Date.now;
Date.now = () => przedPolnocaUTC;
sprawdz("dzisISO: 00:30 czasu polskiego to już następny dzień", dzisISO(-120), "2026-09-03");
sprawdz("dzisISO: ten sam moment w UTC to jeszcze poprzedni", dzisISO(0), "2026-09-02");
Date.now = oryginalny;

// --- Parsowanie odpowiedzi modelu ---
sprawdz("czysty JSON", wyjmijJson('{"a":1}'), {a:1});
sprawdz("w płocie ```json", wyjmijJson('```json\n{"a":1}\n```'), {a:1});
sprawdz("w gołym płocie", wyjmijJson('```\n{"a":2}\n```'), {a:2});
sprawdz("ze zdaniem wstępu", wyjmijJson('Oto wynik:\n{"a":3}'), {a:3});
sprawdz("z gadaniną po JSON-ie", wyjmijJson('{"a":4}\nMam nadzieję, że pomogłem!'), {a:4});
sprawdz("tablica", wyjmijJson('[{"a":5}]'), [{a:5}]);
sprawdz("polskie znaki", wyjmijJson('{"pl":"żółć ćma"}'), {pl:"żółć ćma"});
sprawdz("śmieci dają domyślną", wyjmijJson('zupełnie nie JSON', null), null);
sprawdz("pusty tekst", wyjmijJson('', null), null);

// --- Sanityzacja ---
sprawdz("tekst przycina", tekst("abcdef", 3), "abc");
sprawdz("tekst z null", tekst(null), "");
sprawdz("liczba z bzdury", liczba("abc", 7), 7);
sprawdz("liczba z NaN", liczba(NaN, 5), 5);
sprawdz("bezpieczneJson ze zepsutego", bezpieczneJson("{zepsute", "domyslne"), "domyslne");

// --- Leitner ---
const ODSTEPY = [1,2,4,8,16,32];
let pudelko = 1;
for (let i=0;i<8;i++) pudelko = Math.min(ODSTEPY.length, pudelko+1);
sprawdz("Leitner nie przekracza 6 pudełek", pudelko, 6);
sprawdz("Leitner odstęp ostatniego pudełka", ODSTEPY[pudelko-1], 32);
sprawdz("Leitner reset po błędzie", ODSTEPY[1-1], 1);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

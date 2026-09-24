// Testy składania zapisu wypowiedzi z wyników rozpoznawania mowy.
//
// Zgłoszenie z użycia: aplikacja duplikowała każde słowo ("I I I was was was").
// Przyczyną było doklejanie przyrostów od zdarzenie.resultIndex — Chrome potrafi
// przysłać zdarzenie wskazujące na wyniki już zamknięte, a wtedy te same słowa
// doklejały się kolejny raz. Te testy pilnują, żeby to nie wróciło.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const katalog = dirname(fileURLToPath(import.meta.url));
const zrodlo = readFileSync(join(katalog, "../js/mowa.js"), "utf8");

// Wyciągamy samą funkcję składania — reszta modułu potrzebuje przeglądarki
const poczatek = zrodlo.indexOf("  zlozZapis: function");
const koniec = zrodlo.indexOf("  /**", poczatek + 10);
const zlozZapis = new Function(
  "return { " + zrodlo.slice(poczatek, koniec).trim().replace(/,$/, "") + " }.zlozZapis;"
)();

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano:  ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

// Odwzorowanie listy wyników tak, jak przysyła ją przeglądarka
function wyniki(...pozycje) {
  const lista = pozycje.map(([tekst, koncowy]) => {
    const r = [{ transcript: tekst }];
    r.isFinal = koncowy;
    return r;
  });
  lista.length = pozycje.length;
  return lista;
}

// --- Sedno zgłoszenia ---

// Chrome przysyła listę KUMULATYWNĄ. Każde zdarzenie niesie wszystkie wyniki
// od początku nasłuchu, więc składanie musi dawać ten sam tekst za każdym razem.
const naraz = wyniki(["I", true], ["was", true], ["tired", true]);
sprawdz("to samo zdarzenie policzone raz",
  zlozZapis(naraz), { gotowe: "I was tired", czastkowe: "" });
sprawdz("to samo zdarzenie policzone drugi raz daje ten sam tekst",
  zlozZapis(naraz), { gotowe: "I was tired", czastkowe: "" });
sprawdz("i trzeci raz też",
  zlozZapis(naraz), { gotowe: "I was tired", czastkowe: "" });

// Przebieg narastający: przeglądarka dokłada kolejne słowa do tej samej listy
sprawdz("narastanie: pierwsze słowo", zlozZapis(wyniki(["I", true])),
  { gotowe: "I", czastkowe: "" });
sprawdz("narastanie: drugie słowo", zlozZapis(wyniki(["I", true], ["was", true])),
  { gotowe: "I was", czastkowe: "" });
sprawdz("narastanie: trzecie słowo", zlozZapis(wyniki(["I", true], ["was", true], ["tired", true])),
  { gotowe: "I was tired", czastkowe: "" });

// --- Wyniki częściowe ---

sprawdz("częściowy oddzielony od zamkniętego",
  zlozZapis(wyniki(["I was", true], ["very", false])),
  { gotowe: "I was", czastkowe: "very" });

sprawdz("częściowy zamieniony na zamknięty nie dubluje",
  zlozZapis(wyniki(["I was", true], ["very tired", true])),
  { gotowe: "I was very tired", czastkowe: "" });

// --- Przypadki brzegowe ---

sprawdz("pusta lista", zlozZapis(wyniki()), { gotowe: "", czastkowe: "" });
sprawdz("puste fragmenty pomijane",
  zlozZapis(wyniki(["", true], ["hello", true], ["   ", true])),
  { gotowe: "hello", czastkowe: "" });
sprawdz("spacje wokół fragmentów przycięte",
  zlozZapis(wyniki(["  I  ", true], ["  was  ", true])),
  { gotowe: "I was", czastkowe: "" });

// Powtórzone słowo wypowiedziane naprawdę musi przetrwać — nie odsiewamy duplikatów
sprawdz("prawdziwe powtórzenie zostaje nietknięte",
  zlozZapis(wyniki(["very", true], ["very", true], ["good", true])),
  { gotowe: "very very good", czastkowe: "" });

// --- Android: każda kolejna wersja zdania przychodzi jako osobny wynik ---
// Zgłoszenie z telefonu: "hi hi hi hi hi hi hi hi I'm hi I'm Nico" oraz
// "is is something is something strange ..." zamiast jednego zdania.

sprawdz("android: narastające wersje zdania dają jedno zdanie",
  zlozZapis(wyniki(["is", true], ["is something", true], ["is something strange", true],
    ["is something strange you said", true]), true),
  { gotowe: "is something strange you said", czastkowe: "" });

sprawdz("android: powtórzone hi i narastanie do przedstawienia się",
  zlozZapis(wyniki(["hi", true], ["hi", true], ["hi", true], ["hi", true], ["hi I'm", true], ["hi I'm Nico", true]), true),
  { gotowe: "hi I'm Nico", czastkowe: "" });

sprawdz("android: poprawione ostatnie słowo zastępuje wersję",
  zlozZapis(wyniki(["you are Daniel", true], ["you are Danielle but", true]), true),
  { gotowe: "you are Danielle but", czastkowe: "" });

sprawdz("android: nowe zdanie po pauzie dokleja się",
  zlozZapis(wyniki(["hi I'm Nico", true], ["what is your name", true]), true),
  { gotowe: "hi I'm Nico what is your name", czastkowe: "" });

sprawdz("android: starsza krótsza wersja po dłuższej jest pomijana",
  zlozZapis(wyniki(["I like green tea", true], ["I like", true]), true),
  { gotowe: "I like green tea", czastkowe: "" });

sprawdz("android: częściowa dłuższa wersja zastępuje zamkniętą",
  zlozZapis(wyniki(["I was", true], ["I was very tired", false]), true),
  { gotowe: "", czastkowe: "I was very tired" });

sprawdz("android: interpunkcja i wielkość liter nie przeszkadzają",
  zlozZapis(wyniki(["Hello.", true], ["hello, how are you", true]), true),
  { gotowe: "hello, how are you", czastkowe: "" });

sprawdz("bez rozpoznanego Androida: narastanie wykryte samo",
  zlozZapis(wyniki(["I", true], ["I would", true], ["I would like", true], ["I would like to try", true],
    ["I would like to try everything", true], ["I would like to try everything works well", true])),
  { gotowe: "I would like to try everything works well", czastkowe: "" });

sprawdz("bez rozpoznanego Androida: zwykłe kolejne zdania bez zmian",
  zlozZapis(wyniki(["I was tired", true], ["so I went home", true])),
  { gotowe: "I was tired so I went home", czastkowe: "" });

sprawdz("komputer: bez trybu narastającego nic się nie zmienia",
  zlozZapis(wyniki(["very", true], ["very", true], ["good", true]), false),
  { gotowe: "very very good", czastkowe: "" });

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

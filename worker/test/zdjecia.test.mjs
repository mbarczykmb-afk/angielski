// Testy doboru zdjęcia do zadania 2 (opis ilustracji).
//
// Adres zdjęcia trafia prosto do atrybutu src w przeglądarce, a przychodzi
// z zewnętrznego serwisu — dlatego osobno pilnujemy, żeby nic poza https
// się tam nie przecisnęło. Reszta testów sprawdza, że brak zdjęcia nigdy
// nie wysadza egzaminu, tylko cofa zadanie do opisu słownego.
import { znajdzZdjecie } from "../src/zdjecia.js";

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano:  ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

const prawdziwyFetch = globalThis.fetch;
let zapytania = [];

// Podstawiamy odpowiedzi pod adresy: klucz to fragment adresu
function podstawFetch(odpowiedzi) {
  zapytania = [];
  globalThis.fetch = async (url) => {
    zapytania.push(String(url));
    for (const [fragment, dane] of Object.entries(odpowiedzi)) {
      if (String(url).includes(fragment)) {
        if (dane === "blad") return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => dane };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

function pexels(src) {
  return { photos: [{ src: { large: src }, photographer: "Jan Kowalski", url: "https://www.pexels.com/photo/1/" }] };
}

function commons(mime, thumburl, artist = "Anna Nowak") {
  return {
    query: {
      pages: {
        "42": {
          title: "File:Test.jpg",
          imageinfo: [{
            mime,
            thumburl,
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Test.jpg",
            extmetadata: { Artist: { value: artist }, LicenseShortName: { value: "CC BY-SA 4.0" } },
          }],
        },
      },
    },
  };
}

// --- Brak haseł ---

podstawFetch({});
sprawdz("bez haseł nie szukamy wcale", await znajdzZdjecie({}, []), null);
sprawdz("bez haseł nie ma żadnego zapytania", zapytania.length, 0);

sprawdz("puste hasła traktujemy jak brak", await znajdzZdjecie({}, ["", "   "]), null);

// --- Pexels ---

podstawFetch({ "api.pexels.com": pexels("https://images.pexels.com/photos/1/test.jpg") });
sprawdz("z kluczem bierzemy zdjęcie z Pexels",
  await znajdzZdjecie({ PEXELS_API_KEY: "klucz" }, ["family", "dinner"]),
  {
    url: "https://images.pexels.com/photos/1/test.jpg",
    autor: "Jan Kowalski",
    zrodlo: "Pexels",
    strona: "https://www.pexels.com/photo/1/",
    licencja: "Pexels License",
  });
sprawdz("hasła sklejają się w jedno zapytanie",
  zapytania[0].includes("query=family%20dinner"), true);

// Bez klucza Pexels w ogóle nie pytamy — inaczej dostawalibyśmy 401 przy każdym zestawie
podstawFetch({ "commons.wikimedia.org": commons("image/jpeg", "https://upload.wikimedia.org/x/1024px-Test.jpg") });
const bezKlucza = await znajdzZdjecie({}, ["cafe"]);
sprawdz("bez klucza pomijamy Pexels", zapytania.some((u) => u.includes("pexels")), false);
sprawdz("bez klucza wpadamy na Commons", bezKlucza.zrodlo, "Wikimedia Commons");
sprawdz("podpis autora ma tylko tekst", bezKlucza.autor, "Anna Nowak");
sprawdz("licencja trafia do podpisu", bezKlucza.licencja, "CC BY-SA 4.0");

// --- Bezpieczeństwo adresu ---

// Adres spoza https nie może trafić do src — nawet gdy przyśle go serwis zdjęć
podstawFetch({
  "api.pexels.com": pexels("javascript:alert(1)"),
  "commons.wikimedia.org": commons("image/jpeg", "https://upload.wikimedia.org/x/ratunkowe.jpg"),
});
const poZlymAdresie = await znajdzZdjecie({ PEXELS_API_KEY: "klucz" }, ["park"]);
sprawdz("adres javascript: jest odrzucany", poZlymAdresie.url, "https://upload.wikimedia.org/x/ratunkowe.jpg");

podstawFetch({ "api.pexels.com": pexels("http://images.pexels.com/bez-szyfrowania.jpg") });
sprawdz("zwykłe http też odrzucamy", await znajdzZdjecie({ PEXELS_API_KEY: "klucz" }, ["park"]), null);

// --- Odsiewanie nie-fotografii ---

podstawFetch({ "commons.wikimedia.org": commons("image/svg+xml", "https://upload.wikimedia.org/x/schemat.svg") });
sprawdz("grafika wektorowa nie jest fotografią", await znajdzZdjecie({}, ["diagram"]), null);

// --- Awarie ---

podstawFetch({ "api.pexels.com": "blad", "commons.wikimedia.org": "blad" });
sprawdz("oba źródła padają, egzamin idzie dalej bez zdjęcia",
  await znajdzZdjecie({ PEXELS_API_KEY: "klucz" }, ["cokolwiek"]), null);

globalThis.fetch = async () => { throw new Error("brak sieci"); };
sprawdz("brak sieci nie rzuca wyjątkiem", await znajdzZdjecie({}, ["cokolwiek"]), null);

podstawFetch({ "commons.wikimedia.org": { query: { pages: {} } } });
sprawdz("puste wyniki dają null", await znajdzZdjecie({}, ["cokolwiek"]), null);

globalThis.fetch = prawdziwyFetch;

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

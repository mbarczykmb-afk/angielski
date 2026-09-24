/* ============================================================
   Rdzeń — stan globalny, nawigacja, komunikaty
   ============================================================ */

// Wersja kodu, który NAPRAWDĘ działa na ekranie. Musi być równa końcówce
// WERSJA w sw.js — pilnuje tego test web/test/wersja.test.mjs.
var WERSJA_APLIKACJI = "v24";

var App = {
  stan: null,          // pełny stan z serwera
  lekcja: null,        // materiał aktualnie otwartej lekcji
  matura: null,        // trwające podejście do matury ustnej
  historiaCzatu: [],   // [{role, content}] wysyłane do modelu
  wypowiedzi: [],      // same wypowiedzi ucznia — do podsumowania
  korekty: [],         // korekty zebrane w trakcie rozmowy
  startLekcji: 0,      // znacznik czasu rozpoczęcia
  rozmowaTrwa: false,  // czy pętla mówienia ma się sama podtrzymywać
  ostatniaKwestia: "", // do powtórzenia na żądanie
  doPowtorzenia: "",   // fraza, którą uczeń ma teraz powtórzyć za lektorem
  probyPowtorzenia: 0, // ile razy próbował — po dwóch wracamy do rozmowy
  widok: "dzis",

  // Co zrobić z wypowiedzią ucznia. Mikrofon jest wspólny dla kursu i matury,
  // a to pole decyduje, który moduł ją teraz odbiera — dzięki temu warstwa
  // mowy nie musi wiedzieć nic o modułach.
  odbierzWypowiedz: function (tekst) { wyslijWiadomosc(tekst); },
};

// Czy trwa sesja mówiona — lekcja kursu albo egzamin maturalny
function sesjaTrwa() {
  return !!(App.lekcja || App.matura);
}

/* --- Ikony ---

   Własny zestaw ikon liniowych zamiast emoji. Emoji wyglądają inaczej na
   każdym telefonie (Samsung ma swoje, Google swoje), nie przyjmują koloru
   motywu i przy małych rozmiarach robią się nieczytelne. SVG rysuje się
   wszędzie tak samo i dziedziczy kolor tekstu (currentColor). */

var IKONY = {
  dom: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  slowa: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  postep: '<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-3"/>',
  wiecej: '<path d="M3 6h11M18 6h3M3 12h5M12 12h9M3 18h13M20 18h1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  rozmowa: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  mikrofon: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4M8 22h8"/>',
  klawiatura: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h4M18 13h.01M8 16h8"/>',
  powtorz: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  glosnik: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  graj: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  ok: '<path d="M20 6 9 17l-5-5"/>',
  zamknij: '<path d="M18 6 6 18M6 6l12 12"/>',
  wstecz: '<path d="m15 18-6-6 6-6"/>',
  dalej: '<path d="m9 18 6-6-6-6"/>',
  strzalka: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plomien: '<path d="M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6-4-8-.5 2-1.5 3-3 3.5C12.5 7 11 4 8 2c.5 3-1 5-2.5 7C4.3 10.7 4 12.5 4 15c0 4.3 4 7 8 7z"/>',
  birret: '<path d="M22 9 12 4 2 9l10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  klodka: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sluchawki: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
  iskry: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  puchar: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  zegar: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pobierz: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  wyslij: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  zapisz: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
  chmura: '<path d="M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 17 18z"/>',
  kosz: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  cel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  osoba: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  obraz: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  oko: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  olowek: '<path d="M17 3l4 4L8 20H4v-4z"/>',
  wyloguj: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  kalendarz: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
};

function ik(nazwa, klasa) {
  return '<svg class="ik' + (klasa ? " " + klasa : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (IKONY[nazwa] || "") + "</svg>";
}

/* --- Daty po ludzku ---

   "2026-09-24" to zapis dla bazy, nie dla człowieka. W interfejsie mówimy
   "dziś", "jutro", "za 3 dni", a dalej krótką datą "24 wrz". */

var MIESIACE = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

function dataLudzka(iso, dzisiaj) {
  var tekst = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tekst)) return String(iso || "");

  var cz = tekst.split("-").map(Number);
  var baza = String(dzisiaj || dzisISO()).split("-").map(Number);
  var roznica = Math.round((Date.UTC(cz[0], cz[1] - 1, cz[2]) - Date.UTC(baza[0], baza[1] - 1, baza[2])) / 86400000);

  if (roznica === 0) return "dziś";
  if (roznica === 1) return "jutro";
  if (roznica === -1) return "wczoraj";
  if (roznica > 1 && roznica < 7) return "za " + roznica + " dni";
  if (roznica < -1 && roznica > -7) return roznica * -1 + " dni temu";
  return cz[2] + " " + MIESIACE[cz[1] - 1] + (cz[0] !== baza[0] ? " " + cz[0] : "");
}

/* --- Wibracja ---

   Krótkie drgnięcie przy włączeniu i wyłączeniu mikrofonu. Przy rozmowie
   bez patrzenia w ekran to jedyny sygnał, że telefon zaczął słuchać. */

function haptyka(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms || 12);
  } catch (e) {
    // Brak wibracji to żaden problem — to tylko dodatek
  }
}

/* --- Komunikaty --- */

function toast(wiadomosc, ok) {
  var t = document.getElementById("toast");
  t.textContent = wiadomosc;
  t.className = ok === false ? "blad" : "ok";
  t.style.display = "block";
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(function () {
    t.style.display = "none";
  }, ok === false ? 5000 : 2800);
}

function spinner(wlacz, tekst) {
  var s = document.getElementById("spinner");
  document.getElementById("spinner-tekst").textContent = tekst || "";
  s.classList.toggle("widoczny", !!wlacz);
}

/* --- Ekrany i zakładki --- */

function pokazEkran(nazwa) {
  ["logowanie", "test", "glowny"].forEach(function (e) {
    document.getElementById("ekran-" + e).classList.toggle("aktywny", e === nazwa);
  });
  window.scrollTo(0, 0);
}

var NAZWY_WIDOKOW = {
  dzis: "Dziś",
  rozmowa: "Rozmowa",
  slowa: "Słówka",
  postep: "Postęp",
  ustawienia: "Więcej",
};

function pokazWidok(nazwa) {
  // Czeka nowa wersja aplikacji, a uczeń właśnie wyszedł z rozmowy — to dobry moment
  if (App.nowaWersja && App.widok === "rozmowa" && nazwa !== "rozmowa") {
    location.reload();
    return;
  }
  App.widok = nazwa;

  Object.keys(NAZWY_WIDOKOW).forEach(function (w) {
    document.getElementById("w-" + w).classList.toggle("aktywny", w === nazwa);
  });
  document.querySelectorAll(".nawigacja button").forEach(function (b) {
    b.classList.toggle("aktywny", b.dataset.widok === nazwa);
  });
  // Nagłówek mówi, w którym module jesteśmy — inaczej "Dziś" i "Rozmowa"
  // znaczyłyby co innego w kursie, a co innego na maturze
  var naglowek = NAZWY_WIDOKOW[nazwa];
  if (nazwa === "dzis" && modulAktywny() === "matura") naglowek = "Matura ustna";
  if (nazwa === "rozmowa") {
    naglowek = App.matura ? "Egzamin ustny"
      : App.lekcja ? "Dzień " + App.lekcja.dzien
      : "Podsumowanie";
  }
  document.getElementById("naglowek-widoku").textContent = naglowek;

  // Rozmowa to tryb skupienia, jak lekcja w Duolingo: bez dolnego menu,
  // z powrotem w lewym górnym rogu. Menu w trakcie mówienia tylko kusiło
  // przypadkowym dotknięciem i zabierało miejsce na mikrofon.
  var skupienie = nazwa === "rozmowa";
  document.body.classList.toggle("skupienie", skupienie);
  document.getElementById("btn-wstecz").hidden = !skupienie;

  // Pasek wprowadzania należy wyłącznie do rozmowy w toku
  var wRozmowie = skupienie && sesjaTrwa();
  document.getElementById("czat-wejscie").hidden = !wRozmowie;

  // W trybie skupienia odznaki ustępują miejsca zakończeniu —
  // wynik i passa mogą poczekać, a wyjście z rozmowy nie
  document.getElementById("odznaki").hidden = skupienie;
  var koniec = document.getElementById("btn-zakoncz-gora");
  koniec.hidden = !wRozmowie;
  koniec.innerHTML = ik("ok") + (App.matura ? "Zakończ i oceń" : "Zakończ");

  var rysuj = {
    dzis: rysujDzis,
    rozmowa: rysujRozmowe,
    slowa: rysujSlowa,
    postep: rysujPostep,
    ustawienia: rysujUstawienia,
  }[nazwa];
  if (rysuj) rysuj();

  window.scrollTo(0, 0);
}

/* --- Drobiazgi --- */

// Każdy tekst z serwera i od modelu wstawiamy przez tę funkcję, nigdy przez innerHTML
function esc(tekst) {
  return String(tekst == null ? "" : tekst)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dzisISO() {
  var d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

// Przesunięcie strefy w minutach — serwer liczy "dziś" według zegara telefonu
function strefaMin() {
  return new Date().getTimezoneOffset();
}

function odswiezOdznaki() {
  if (!App.stan) return;
  var u = App.stan.user;
  document.getElementById("odznaka-poziom").textContent = u.poziom || "—";
  document.getElementById("odznaka-passa").innerHTML = ik("plomien") + u.streak;
  document.getElementById("odznaka-xp").textContent = u.xp + " XP";

  var doPowtorki = App.stan.slowka.filter(function (s) { return s.doPowtorki; }).length;
  document.getElementById("kropka-slowa").hidden = doPowtorki === 0;
}

function liczbaDoPowtorki() {
  if (!App.stan) return 0;
  return App.stan.slowka.filter(function (s) { return s.doPowtorki; }).length;
}

/* --- Ocena powtórzenia za wzorem --- */

// Zapis z mikrofonu nie ma interpunkcji i bywa niedoskonały, więc porównujemy
// same słowa, nie znaki. Liczy się to, ile słów wzoru uczeń faktycznie wypowiedział.
function naSlowa(tekst) {
  return String(tekst || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function podobienstwo(powiedziane, wzor) {
  var slowaWzoru = naSlowa(wzor);
  if (!slowaWzoru.length) return 0;

  var pozostale = naSlowa(powiedziane);
  var trafione = 0;

  for (var i = 0; i < slowaWzoru.length; i++) {
    var gdzie = pozostale.indexOf(slowaWzoru[i]);
    if (gdzie > -1) {
      trafione++;
      pozostale.splice(gdzie, 1); // każde słowo liczy się raz
    }
  }

  return trafione / slowaWzoru.length;
}

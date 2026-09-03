/* ============================================================
   Rdzeń — stan globalny, nawigacja, komunikaty
   ============================================================ */

var App = {
  stan: null,          // pełny stan z serwera
  lekcja: null,        // materiał aktualnie otwartej lekcji
  historiaCzatu: [],   // [{role, content}] wysyłane do modelu
  wypowiedzi: [],      // same wypowiedzi ucznia — do podsumowania
  korekty: [],         // korekty zebrane w trakcie rozmowy
  startLekcji: 0,      // znacznik czasu rozpoczęcia
  rozmowaTrwa: false,  // czy pętla mówienia ma się sama podtrzymywać
  ostatniaKwestia: "", // do powtórzenia na żądanie
  doPowtorzenia: "",   // fraza, którą uczeń ma teraz powtórzyć za lektorem
  probyPowtorzenia: 0, // ile razy próbował — po dwóch wracamy do rozmowy
  widok: "dzis",
};

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
  App.widok = nazwa;

  Object.keys(NAZWY_WIDOKOW).forEach(function (w) {
    document.getElementById("w-" + w).classList.toggle("aktywny", w === nazwa);
  });
  document.querySelectorAll(".nawigacja button").forEach(function (b) {
    b.classList.toggle("aktywny", b.dataset.widok === nazwa);
  });
  document.getElementById("naglowek-widoku").textContent = NAZWY_WIDOKOW[nazwa];

  // Pasek wprowadzania należy wyłącznie do rozmowy w toku
  var wRozmowie = nazwa === "rozmowa" && !!App.lekcja;
  document.getElementById("czat-wejscie").hidden = !wRozmowie;

  // W trakcie rozmowy odznaki ustępują miejsca zakończeniu lekcji —
  // wynik i passa mogą poczekać, a wyjście z rozmowy nie
  document.getElementById("odznaki").hidden = wRozmowie;
  document.getElementById("btn-zakoncz-gora").hidden = !wRozmowie;

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
  document.getElementById("odznaka-passa").textContent = "🔥 " + u.streak;
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

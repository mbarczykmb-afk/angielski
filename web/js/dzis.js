/* ============================================================
   Widok "Dziś" — lekcja dnia, cel dnia, plan 30 dni
   ============================================================ */

function rysujDzis() {
  var widok = document.getElementById("w-dzis");
  if (!App.stan) {
    widok.innerHTML = '<div class="pusto">Ładuję...</div>';
    return;
  }

  // Dwa moduły dzielą tę zakładkę: kurs konwersacyjny i przygotowanie do matury.
  // Wybór modułu to przełącznik na górze, a nie kolejna ikona w menu —
  // menu ma cztery pozycje i tak ma zostać, żeby każda była łatwa do trafienia.
  if (modulAktywny() === "matura") {
    rysujMature();
    return;
  }

  rysujDzisKurs();
}

/* --- Wspólne klocki ekranu głównego (używa ich też moduł matury) --- */

function minutyDzis() {
  var s = App.stan;
  return Math.round(s.postep
    .filter(function (p) { return p.data === s.dzis; })
    .reduce(function (a, p) { return a + p.czasSek; }, 0) / 60);
}

// Pierścień celu dnia. Liczymy minuty, nie XP — minuty mówienia są tym,
// co faktycznie uczy, a cel ustawia się w minutach przy zakładaniu profilu.
function pierscienCelu() {
  var cel = App.stan.user.celDzienny || 15;
  var minuty = minutyDzis();
  var udzial = Math.min(1, minuty / cel);
  var obwod = 2 * Math.PI * 26;

  return '<div class="pierscien" title="Cel dnia: ' + cel + ' min">' +
    '<svg viewBox="0 0 62 62"><circle class="tlo-kola" cx="31" cy="31" r="26" fill="none" stroke-width="6"/>' +
    '<circle class="wypelnienie" cx="31" cy="31" r="26" fill="none" stroke-width="6" stroke-linecap="round" ' +
    'stroke-dasharray="' + obwod.toFixed(1) + '" stroke-dashoffset="' + (obwod * (1 - udzial)).toFixed(1) + '"/></svg>' +
    '<div class="wartosc"><b>' + minuty + "</b><small>z " + cel + " min</small></div></div>";
}

function powitanie() {
  var u = App.stan.user;
  var godzina = new Date().getHours();
  var zwrot = godzina < 5 ? "Dobry wieczór" : godzina < 12 ? "Dzień dobry" : godzina < 18 ? "Cześć" : "Dobry wieczór";

  var minuty = minutyDzis();
  var cel = u.celDzienny || 15;
  var podpis = minuty >= cel ? "Cel dnia zrobiony. Świetnie!"
    : u.streak > 1 ? "Seria " + u.streak + " " + odmianaDni(u.streak) + " — nie przerywaj jej dziś."
    : "Kilkanaście minut mówienia robi różnicę.";

  return '<div class="powitanie"><div class="tekst"><h2>' + zwrot + ", " + esc(u.nazwa) + "</h2>" +
    "<p>" + podpis + "</p></div>" + pierscienCelu() + "</div>";
}

// Niedokończona rozmowa nie może zniknąć z oczu po wyjściu z niej
function kartaWznowienia() {
  if (App.matura) {
    return '<div class="karta wznow"><div class="tresc"><b>Trwa egzamin ustny</b>' +
      '<p class="mini">' + esc(App.matura.trybNazwa || "") + "</p></div>" +
      '<button class="btn maly" id="btn-wznow">Wróć' + ik("dalej") + "</button></div>";
  }
  if (App.lekcja) {
    return '<div class="karta wznow"><div class="tresc"><b>Trwa rozmowa — dzień ' + App.lekcja.dzien + "</b>" +
      '<p class="mini">' + esc(App.lekcja.temat || "") + "</p></div>" +
      '<button class="btn maly" id="btn-wznow">Wróć' + ik("dalej") + "</button></div>";
  }
  return "";
}

function podepnijWznowienie() {
  var wznow = document.getElementById("btn-wznow");
  if (wznow) wznow.onclick = function () { pokazWidok("rozmowa"); };
}

/* --- Kurs 30 dni --- */

function rysujDzisKurs() {
  var widok = document.getElementById("w-dzis");
  var s = App.stan;
  var dzien = s.plan.find(function (p) { return p.dzien === s.biezacyDzien; });
  var ukonczone = s.plan.filter(function (p) { return p.status === "ukonczony"; }).length;
  var doPowtorki = liczbaDoPowtorki();

  var html = przelacznikModulu() + powitanie() + kartaWznowienia();

  /* --- Karta lekcji dnia --- */

  if (!dzien) {
    html += '<div class="karta bohater srodek">' +
      '<div class="etykieta">Na start</div>' +
      "<h2>Sprawdźmy Twój poziom</h2>" +
      '<p class="podpis">Pięć minut testu, a ułożę Ci plan 30 dni rozmów dopasowany do Twoich braków.</p>' +
      '<button class="btn" id="btn-zrob-test">' + ik("graj") + "Zrób test</button></div>";
  } else if (s.zrobioneDzis && dzien.status === "ukonczony") {
    html += '<div class="karta bohater srodek">' +
      '<div class="etykieta">' + ik("ok") + " Dzisiejsza lekcja zrobiona</div>" +
      "<h2>Dobra robota!</h2>" +
      '<p class="podpis">Jutro dzień ' + s.biezacyDzien + ". Możesz jeszcze pogadać albo powtórzyć słówka.</p>" +
      '<button class="btn" id="btn-dodatkowa">' + ik("rozmowa") + "Jeszcze jedna rozmowa</button></div>";
  } else {
    html += '<div class="karta bohater">' +
      '<div class="etykieta">Dzień ' + dzien.dzien + " z " + s.plan.length + "</div>" +
      "<h2>" + esc(dzien.temat) + "</h2>" +
      '<p class="podpis">' + esc(dzien.cel) + "</p>" +
      '<button class="btn" id="btn-start-lekcji">' + ik("mikrofon") + "Zacznij rozmowę</button></div>";
  }

  /* --- Kafelki: powtórki i seria --- */

  html += '<div class="kafelki">' +
    '<button class="kafelek' + (doPowtorki ? " uwaga" : "") + '" id="kafelek-powtorki">' + ik("slowa") +
    "<b>" + doPowtorki + "</b><span>" + (doPowtorki ? odmianaSlowek(doPowtorki) + " do powtórki" : "powtórki zrobione") + "</span></button>" +
    '<button class="kafelek" id="kafelek-seria">' + ik("plomien") +
    "<b>" + s.user.streak + "</b><span>" + odmianaDni(s.user.streak) + " z rzędu</span></button>" +
    "</div>";

  /* --- Plan: oś 30 kropek i najbliższe dni --- */

  if (s.plan.length) {
    var nastepne = s.plan.filter(function (p) { return p.dzien >= s.biezacyDzien; }).slice(0, 3);

    html += '<div class="karta"><h3>Plan 30 dni · ' + ukonczone + " za Tobą</h3>" +
      '<div class="os-planu">' +
      s.plan.map(function (p) {
        var klasa = p.status === "ukonczony" ? "zrobiony" : (p.dzien === s.biezacyDzien ? "biezacy" : "");
        return '<span class="' + klasa + '" title="Dzień ' + p.dzien + '"></span>';
      }).join("") + "</div>" +
      nastepne.map(wierszPlanu).join("") +
      '<details><summary>Cały plan</summary><div id="lista-planu">' +
      s.plan.map(wierszPlanu).join("") + "</div></details></div>";
  }

  widok.innerHTML = html;

  /* --- Zdarzenia --- */

  podepnijPrzelacznikModulu(widok);
  podepnijWznowienie();

  var start = document.getElementById("btn-start-lekcji");
  if (start) start.onclick = function () { otworzLekcje(s.biezacyDzien); };

  var dodatkowa = document.getElementById("btn-dodatkowa");
  if (dodatkowa) dodatkowa.onclick = function () { otworzLekcje(s.biezacyDzien); };

  var test = document.getElementById("btn-zrob-test");
  if (test) test.onclick = function () { pokazEkran("test"); };

  document.getElementById("kafelek-powtorki").onclick = function () { pokazWidok("slowa"); };
  document.getElementById("kafelek-seria").onclick = function () { pokazWidok("postep"); };

  // Wcześniejsze dni wolno otworzyć ponownie — powtórka rozmowy nie zaszkodzi
  widok.querySelectorAll(".dzien-planu").forEach(function (el) {
    el.onclick = function () {
      var nr = Number(el.dataset.dzien);
      if (nr > s.biezacyDzien) {
        toast("Najpierw skończ dzień " + s.biezacyDzien + ".", false);
        return;
      }
      otworzLekcje(nr);
    };
  });
}

function wierszPlanu(p) {
  var s = App.stan;
  var klasa = p.status === "ukonczony" ? "ukonczony" : (p.dzien === s.biezacyDzien ? "biezacy" : "");
  return '<div class="dzien-planu ' + klasa + '" data-dzien="' + p.dzien + '">' +
    '<div class="numer">' + (p.status === "ukonczony" ? ik("ok") : p.dzien) + "</div>" +
    '<div class="opis">' + esc(p.temat) + "<small>" + esc(p.cel) + "</small></div></div>";
}

function odmianaSlowek(n) {
  if (n === 1) return "słówko";
  var ostatnia = n % 10;
  var przedostatnia = Math.floor(n / 10) % 10;
  if (ostatnia >= 2 && ostatnia <= 4 && przedostatnia !== 1) return "słówka";
  return "słówek";
}

function odmianaDni(n) {
  return n === 1 ? "dzień" : "dni";
}

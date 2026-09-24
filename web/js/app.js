/* ============================================================
   Start aplikacji
   ============================================================ */

async function odswiezStan() {
  App.stan = await Api.pobierz("/api/stan");
  return App.stan;
}

// Po zalogowaniu: bez oceny idziemy na test, z oceną prosto do planu
async function wczytajStanIPokaz() {
  await odswiezStan();
  odswiezOdznaki();

  if (!App.stan.ocena || !App.stan.plan.length) {
    pokazEkran("test");
    document.getElementById("test-powitanie").hidden = false;
    document.getElementById("test-pytanie").hidden = true;
    document.getElementById("test-wynik").hidden = true;
  } else {
    pokazEkran("glowny");
    pokazWidok("dzis");
  }
}

// Ikony wstawiamy z jednego miejsca, żeby HTML nie dublował rysunków SVG
function wstawIkony() {
  document.querySelectorAll(".nawigacja button").forEach(function (b) {
    b.querySelector(".ikona").innerHTML = ik(b.dataset.ikona);
  });
  document.getElementById("btn-wstecz").innerHTML = ik("wstecz");
  document.getElementById("btn-klawiatura").innerHTML = ik("klawiatura");
  document.getElementById("btn-pomoc").innerHTML = ik("iskry");
  document.getElementById("btn-mikrofon").innerHTML = ik("mikrofon");
  document.getElementById("btn-powtorz").innerHTML = ik("powtorz");
  document.getElementById("btn-tlumacz").innerHTML = '<span class="pl">PL</span>';
  document.getElementById("btn-wyslij").innerHTML = ik("strzalka");
}

// Wyjście z rozmowy przerywa lektora i mikrofon, żeby nie działały w tle.
// Sama rozmowa zostaje — da się do niej wrócić z zakładki Dziś.
function opuscRozmowe(dokad) {
  Mowa.cisza();
  Mowa.stop();
  ustawPodpowiedz("");
  pokazWidok(dokad || "dzis");
}

function podepnijNawigacje() {
  wstawIkony();

  document.querySelectorAll(".nawigacja button").forEach(function (b) {
    b.onclick = function () {
      if (App.widok === "rozmowa") opuscRozmowe(b.dataset.widok);
      else pokazWidok(b.dataset.widok);
    };
  });

  document.getElementById("btn-wstecz").onclick = function () {
    // Podsumowanie zostawia po sobie kartę w widoku rozmowy — przy wyjściu sprzątamy
    var podsumowanie = document.getElementById("blok-podsumowania");
    if (podsumowanie && !sesjaTrwa()) podsumowanie.remove();
    opuscRozmowe("dzis");
  };
}

function podepnijSiec() {
  var pasek = document.getElementById("offline");

  function aktualizuj() {
    pasek.classList.toggle("widoczny", !navigator.onLine);
  }

  window.addEventListener("online", aktualizuj);
  window.addEventListener("offline", aktualizuj);
  aktualizuj();
}

async function start() {
  podepnijLogowanie();
  podepnijTest();
  podepnijRozmowe();
  podepnijNawigacje();
  podepnijSiec();

  // Service worker daje instalację na ekranie głównym i działanie bez sieci
  if ("serviceWorker" in navigator) {
    try {
      // Gdy przy starcie strona nie ma jeszcze service workera, to pierwsza
      // instalacja — nie przeładowujemy. Każde późniejsze przejęcie strony
      // przez nowego workera oznacza nową wersję aplikacji.
      var byl = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (byl) nowaWersjaGotowa();
      });
      var rejestracja = await navigator.serviceWorker.register("./sw.js");
      // Telefon trzyma aplikację otwartą godzinami — sprawdzamy aktualizacje
      // przy każdym powrocie do niej, a nie tylko przy pełnym starcie
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) rejestracja.update().catch(function () {});
      });
    } catch (e) {
      console.warn("Service worker nie wystartował:", e);
    }
  }

  if (!Api.adres || !Api.token) {
    startLogowania();
    return;
  }

  // Token z poprzedniej sesji — próbujemy wejść od razu do aplikacji
  spinner(true, "Wczytuję postępy...");
  try {
    await wczytajStanIPokaz();
  } catch (e) {
    Api.zapiszToken("");
    startLogowania();
    if (navigator.onLine) toast(e.message, false);
  } finally {
    spinner(false);
  }
}

window.addEventListener("load", start);

/**
 * Nowa wersja aplikacji już jest w telefonie — przeładowujemy stronę, żeby
 * zaczęła jej używać. W trakcie rozmowy nie przerywamy: przeładowanie czeka,
 * aż uczeń z niej wyjdzie.
 */
function nowaWersjaGotowa() {
  if (App.nowaWersja) return;
  App.nowaWersja = true;
  if (App.widok !== "rozmowa") location.reload();
}

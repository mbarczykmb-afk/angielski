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

function podepnijNawigacje() {
  document.querySelectorAll(".nawigacja button").forEach(function (b) {
    b.onclick = function () {
      // Wyjście z rozmowy przerywa lektora, żeby nie mówił w tle
      if (App.widok === "rozmowa" && b.dataset.widok !== "rozmowa") {
        // Lektor milknie, mikrofon gasnie, a petla bez rak nie budzi sie w tle
        Mowa.cisza();
        Mowa.stop();
        ustawPodpowiedz("");
      }
      pokazWidok(b.dataset.widok);
    };
  });
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
      await navigator.serviceWorker.register("./sw.js");
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

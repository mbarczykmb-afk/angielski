/* ============================================================
   Ustawienia — profil, mowa, kopie zapasowe
   ============================================================ */

function rysujUstawienia() {
  var widok = document.getElementById("w-ustawienia");
  if (!App.stan) return;

  var u = App.stan.user;
  var ust = u.ustawienia || {};

  widok.innerHTML =
    /* --- Profil --- */
    '<div class="karta"><h3>Profil</h3>' +
    '<h2 style="font-size:19px">' + esc(u.nazwa) + "</h2>" +
    '<p class="podpis">' + (u.poziom || "brak oceny") + " · " + u.xp + " XP · 🔥 " + u.streak + " dni</p>" +
    '<label for="pole-cel-dzienny">Cel dzienny</label>' +
    '<select id="pole-cel-dzienny">' +
    [10, 15, 20, 30].map(function (m) {
      return '<option value="' + m + '"' + (u.celDzienny === m ? " selected" : "") + ">" + m + " minut</option>";
    }).join("") +
    "</select></div>" +

    /* --- Mowa --- */
    '<div class="karta"><h3>Mowa</h3>' +
    przelacznik("ust-glos", "Lektor czyta odpowiedzi", ust.glos !== false) +
    '<label for="pole-tempo">Tempo lektora: <span id="etykieta-tempo">' + (ust.tempoMowy || 0.95) + "×</span></label>" +
    '<input id="pole-tempo" type="range" min="0.6" max="1.3" step="0.05" value="' + (ust.tempoMowy || 0.95) + '">' +
    '<button class="btn drugi" id="btn-test-glosu" style="margin-top:8px">🔊 Posłuchaj próbki</button>' +
    '<p class="mini" style="margin-top:8px">' + statusMowy() + "</p></div>" +

    /* --- Model --- */
    '<div class="karta"><h3>Model rozmowy</h3>' +
    '<select id="pole-model">' +
    '<option value="haiku"' + (ust.modelRozmowy !== "opus" ? " selected" : "") + ">Szybki — Haiku 4.5 (zalecany)</option>" +
    '<option value="opus"' + (ust.modelRozmowy === "opus" ? " selected" : "") + ">Dokładny — Opus 5 (droższy)</option>" +
    "</select>" +
    '<p class="mini" style="margin-top:8px">Dotyczy tylko tur rozmowy. Ocena poziomu, plan i podsumowania lekcji zawsze idą przez Opus 5.</p></div>' +

    /* --- Kopie zapasowe --- */
    '<div class="karta"><h3>Kopia zapasowa</h3>' +
    '<p class="podpis">Postępy zapisują się same po każdej lekcji. Tutaj zrobisz kopię ręcznie albo pobierzesz ją do pliku.</p>' +
    '<button class="btn drugi" id="btn-kopia-teraz" style="margin-top:10px">💾 Zrób kopię teraz</button>' +
    '<button class="btn drugi" id="btn-eksport">⬇ Pobierz plik z postępami</button>' +
    '<button class="btn drugi" id="btn-import">⬆ Wczytaj z pliku</button>' +
    '<input id="pole-plik" type="file" accept="application/json,.json" hidden>' +
    '<div id="lista-kopii" style="margin-top:12px"></div></div>' +

    /* --- Dysk Google --- */
    '<div class="karta"><h3>Dysk Google</h3><div id="blok-dysku"><p class="mini">Sprawdzam...</p></div></div>' +

    /* --- Bezpieczeństwo --- */
    '<div class="karta"><h3>PIN</h3>' +
    '<p class="podpis">' + (u.maPin ? "Profil jest chroniony PIN-em." : "Profil nie ma PIN-u.") + "</p>" +
    (u.maPin ? '<label for="pole-stary-pin">Obecny PIN</label><input id="pole-stary-pin" type="password" inputmode="numeric" maxlength="8">' : "") +
    '<label for="pole-nowy-pin2">Nowy PIN (puste = wyłącz)</label>' +
    '<input id="pole-nowy-pin2" type="password" inputmode="numeric" maxlength="8">' +
    '<button class="btn drugi" id="btn-zmien-pin" style="margin-top:8px">Zapisz PIN</button></div>' +

    /* --- Konto --- */
    '<div class="karta"><h3>Konto</h3>' +
    '<button class="btn drugi" id="btn-wyloguj">Wyloguj</button>' +
    '<p class="mini" style="margin-top:10px">Serwer: ' + esc(Api.adres) + "</p>" +
    '<p class="mini"><a href="#" id="link-zmien-adres2" style="color:var(--przygasly)">Zmień adres serwera</a></p></div>';

  podepnijUstawienia();
  wczytajListeKopii();
  wczytajDysk();
}

function przelacznik(id, etykieta, wlaczony) {
  return '<div class="przelacznik"><span>' + esc(etykieta) + "</span>" +
    '<input type="checkbox" id="' + id + '"' + (wlaczony ? " checked" : "") + "></div>";
}

function statusMowy() {
  var czesci = [];
  czesci.push(Mowa.obslugiwaneSluchanie() ? "🎤 Mikrofon: działa" : "🎤 Mikrofon: brak wsparcia (użyj Chrome)");
  czesci.push(Mowa.obslugiwaneMowienie() ? "🔊 Lektor: działa" : "🔊 Lektor: brak wsparcia");
  return czesci.join(" · ");
}

function podepnijUstawienia() {
  /* --- Zapis ustawień --- */

  async function zapisz() {
    var ustawienia = {
      glos: document.getElementById("ust-glos").checked,
      mikrofon: true,
      tempoMowy: Number(document.getElementById("pole-tempo").value),
      modelRozmowy: document.getElementById("pole-model").value,
      celDzienny: Number(document.getElementById("pole-cel-dzienny").value),
    };

    try {
      await Api.wyslij("/api/ustawienia", { ustawienia: ustawienia });
      App.stan.user.ustawienia = ustawienia;
      App.stan.user.celDzienny = ustawienia.celDzienny;
      toast("Zapisano ✓");
    } catch (e) {
      toast(e.message, false);
    }
  }

  ["ust-glos", "pole-model", "pole-cel-dzienny"].forEach(function (id) {
    document.getElementById(id).onchange = zapisz;
  });

  var tempo = document.getElementById("pole-tempo");
  tempo.oninput = function () {
    document.getElementById("etykieta-tempo").textContent = tempo.value + "×";
  };
  tempo.onchange = zapisz;

  document.getElementById("btn-test-glosu").onclick = function () {
    App.stan.user.ustawienia.tempoMowy = Number(tempo.value);
    App.stan.user.ustawienia.glos = true;
    Mowa.powiedz("Hi! Let's practise your English. How was your day?");
  };

  /* --- Kopie zapasowe --- */

  document.getElementById("btn-kopia-teraz").onclick = async function () {
    spinner(true, "Zapisuję kopię...");
    try {
      await Api.wyslij("/api/kopie", {});
      await wczytajListeKopii();
      toast("Kopia zapisana ✓");
    } catch (e) {
      toast(e.message, false);
    } finally {
      spinner(false);
    }
  };

  document.getElementById("btn-eksport").onclick = async function () {
    spinner(true, "Przygotowuję plik...");
    try {
      var dane = await Api.pobierz("/api/kopie/eksport");
      var blob = new Blob([JSON.stringify(dane, null, 1)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "angielski-ai_" + App.stan.user.nazwa.replace(/[^\w]/g, "_") + "_" + dzisISO() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Plik pobrany ✓");
    } catch (e) {
      toast(e.message, false);
    } finally {
      spinner(false);
    }
  };

  var pole = document.getElementById("pole-plik");
  document.getElementById("btn-import").onclick = function () { pole.click(); };

  pole.onchange = async function () {
    var plik = pole.files && pole.files[0];
    if (!plik) return;

    if (!confirm("Wczytanie kopii nadpisze obecne postępy tego profilu. Na wszelki wypadek zapiszę wcześniej migawkę. Kontynuować?")) {
      pole.value = "";
      return;
    }

    spinner(true, "Wczytuję kopię...");
    try {
      var tekstPliku = await plik.text();
      await Api.wyslij("/api/kopie/przywroc", { json: tekstPliku });
      await odswiezStan();
      odswiezOdznaki();
      rysujUstawienia();
      toast("Postępy przywrócone ✓");
    } catch (e) {
      toast(e.message, false);
    } finally {
      pole.value = "";
      spinner(false);
    }
  };

  /* --- PIN --- */

  document.getElementById("btn-zmien-pin").onclick = async function () {
    var stary = document.getElementById("pole-stary-pin");
    try {
      await Api.wyslij("/api/auth/pin", {
        stary: stary ? stary.value : "",
        nowy: document.getElementById("pole-nowy-pin2").value.trim(),
      });
      await odswiezStan();
      rysujUstawienia();
      toast("PIN zapisany ✓");
    } catch (e) {
      toast(e.message, false);
    }
  };

  /* --- Konto --- */

  document.getElementById("btn-wyloguj").onclick = async function () {
    try {
      await Api.wyslij("/api/auth/wylogowanie", {});
    } catch (e) {
      // Wylogowanie lokalne ma zadziałać nawet bez sieci
    }
    Api.zapiszToken("");
    App.stan = null;
    App.lekcja = null;
    startLogowania();
  };

  document.getElementById("link-zmien-adres2").onclick = function (e) {
    e.preventDefault();
    Api.zapiszToken("");
    App.stan = null;
    document.getElementById("pole-adres").value = Api.adres;
    pokazEkran("logowanie");
    pokazBlok("adres");
  };
}

async function wczytajListeKopii() {
  var blok = document.getElementById("lista-kopii");
  if (!blok) return;

  try {
    var odp = await Api.pobierz("/api/kopie");
    var kopie = odp.kopie || [];

    if (!kopie.length) {
      blok.innerHTML = '<p class="mini">Brak kopii.</p>';
      return;
    }

    blok.innerHTML = "<h3>Zapisane kopie (" + kopie.length + ")</h3>" +
      kopie.slice(0, 10).map(function (k) {
        return '<div class="pozycja"><div class="tresc"><b>' + esc(k.ts) + "</b>" +
          "<small>" + esc(k.zrodlo) + " · " + Math.round(k.rozmiar / 1024) + " KB</small></div>" +
          '<button class="btn maly drugi" data-przywroc="' + esc(k.id) + '">Przywróć</button></div>';
      }).join("");

    blok.querySelectorAll("[data-przywroc]").forEach(function (b) {
      b.onclick = async function () {
        if (!confirm("Przywrócić postępy z tej kopii? Obecne dane profilu zostaną nadpisane.")) return;

        spinner(true, "Przywracam...");
        try {
          await Api.wyslij("/api/kopie/przywroc", { backupId: b.dataset.przywroc });
          await odswiezStan();
          odswiezOdznaki();
          rysujUstawienia();
          toast("Przywrócono ✓");
        } catch (e) {
          toast(e.message, false);
        } finally {
          spinner(false);
        }
      };
    });
  } catch (e) {
    blok.innerHTML = '<p class="mini">Nie udało się wczytać listy kopii.</p>';
  }
}

/* ============================================================
   Dysk Google — kopie niezależne od Cloudflare
   ============================================================ */

async function wczytajDysk() {
  var blok = document.getElementById("blok-dysku");
  if (!blok) return;

  try {
    var status = await Api.pobierz("/api/dysk/status");

    if (!status.skonfigurowany) {
      blok.innerHTML =
        '<p class="podpis">Worker nie ma danych OAuth Google, więc zapis na Dysk jest wyłączony.</p>' +
        '<p class="mini" style="margin-top:6px">Instrukcja konfiguracji jest w README, sekcja „Kopie na Dysku Google”.</p>';
      return;
    }

    if (!status.polaczony) {
      blok.innerHTML =
        '<p class="podpis">Po połączeniu konta aplikacja będzie odkładać postępy na Twój Dysk po każdej lekcji. ' +
        "Kopia przestaje wtedy zależeć od jednego serwera.</p>" +
        '<p class="mini" style="margin-top:6px">Aplikacja dostaje dostęp wyłącznie do plików, które sama utworzy — reszta Dysku pozostaje dla niej niewidoczna.</p>' +
        '<button class="btn drugi" id="btn-polacz-dysk" style="margin-top:10px">Połącz z Dyskiem Google</button>';

      document.getElementById("btn-polacz-dysk").onclick = polaczDysk;
      return;
    }

    blok.innerHTML =
      '<p class="podpis">✓ Połączono' + (status.email ? " jako " + esc(status.email) : "") + "</p>" +
      '<button class="btn drugi" id="btn-kopia-dysk" style="margin-top:10px">☁ Wyślij kopię teraz</button>' +
      '<div id="pliki-dysku" style="margin-top:12px"><p class="mini">Wczytuję listę...</p></div>' +
      '<button class="btn niebezpieczny" id="btn-rozlacz-dysk" style="margin-top:10px">Rozłącz Dysk</button>';

    document.getElementById("btn-kopia-dysk").onclick = async function () {
      spinner(true, "Wysyłam na Dysk...");
      try {
        await Api.wyslij("/api/dysk/kopia", {});
        toast("Kopia na Dysku ✓");
        await wczytajPlikiZDysku();
      } catch (e) {
        toast(e.message, false);
      } finally {
        spinner(false);
      }
    };

    document.getElementById("btn-rozlacz-dysk").onclick = async function () {
      if (!confirm("Rozłączyć Dysk? Pliki już zapisane na Dysku zostaną nietknięte.")) return;
      try {
        await Api.wyslij("/api/dysk/rozlacz", {});
        toast("Rozłączono ✓");
        wczytajDysk();
      } catch (e) {
        toast(e.message, false);
      }
    };

    wczytajPlikiZDysku();
  } catch (e) {
    blok.innerHTML = '<p class="mini">Nie udało się sprawdzić stanu Dysku: ' + esc(e.message) + "</p>";
  }
}

async function polaczDysk() {
  spinner(true, "Przygotowuję autoryzację...");
  try {
    var odp = await Api.wyslij("/api/dysk/start", {});

    // Zgoda Google otwiera się w nowej karcie; aplikacja zostaje w tle
    window.open(odp.url, "_blank", "noopener");

    var blok = document.getElementById("blok-dysku");
    blok.innerHTML =
      '<p class="podpis">Otworzyłem stronę zgody Google w nowej karcie. Zatwierdź dostęp, wróć tutaj i dotknij „Sprawdź”.</p>' +
      '<button class="btn" id="btn-sprawdz-dysk" style="margin-top:10px">Sprawdź połączenie</button>';

    document.getElementById("btn-sprawdz-dysk").onclick = wczytajDysk;
  } catch (e) {
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

async function wczytajPlikiZDysku() {
  var blok = document.getElementById("pliki-dysku");
  if (!blok) return;

  try {
    var odp = await Api.pobierz("/api/dysk/kopie");
    var pliki = odp.pliki || [];

    if (!pliki.length) {
      blok.innerHTML = '<p class="mini">Na Dysku nie ma jeszcze żadnej kopii.</p>';
      return;
    }

    blok.innerHTML = "<h3>Kopie na Dysku (" + pliki.length + ")</h3>" +
      pliki.map(function (p) {
        return '<div class="pozycja"><div class="tresc"><b>' + esc(p.utworzono) + "</b>" +
          "<small>" + Math.round(p.rozmiar / 1024) + " KB</small></div>" +
          '<button class="btn maly drugi" data-dysk="' + esc(p.id) + '">Przywróć</button></div>';
      }).join("");

    blok.querySelectorAll("[data-dysk]").forEach(function (b) {
      b.onclick = async function () {
        if (!confirm("Przywrócić postępy z tej kopii? Obecne dane profilu zostaną nadpisane.")) return;

        spinner(true, "Pobieram z Dysku i przywracam...");
        try {
          await Api.wyslij("/api/dysk/przywroc", { fileId: b.dataset.dysk });
          await odswiezStan();
          odswiezOdznaki();
          rysujUstawienia();
          toast("Przywrócono z Dysku ✓");
        } catch (e) {
          toast(e.message, false);
        } finally {
          spinner(false);
        }
      };
    });
  } catch (e) {
    blok.innerHTML = '<p class="mini">Nie udało się wczytać listy z Dysku: ' + esc(e.message) + "</p>";
  }
}

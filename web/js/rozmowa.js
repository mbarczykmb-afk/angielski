/* ============================================================
   Rozmowa — sedno aplikacji

   Zasada: 90% mówienia i słuchania, 10% czytania.
   Lektor mówi pierwszy, mikrofon włącza się sam, a tekst wypowiedzi
   pozostaje zakryty, dopóki uczeń go nie odsłoni. Czytanie ma być
   ratunkiem, gdy czegoś nie dosłyszał, a nie domyślnym trybem pracy.
   ============================================================ */

function otworzLekcje(dzien) {
  spinner(true, "Przygotowuję lekcję...");

  Api.pobierz("/api/lekcja/" + dzien).then(function (lekcja) {
    App.lekcja = lekcja;
    App.historiaCzatu = [];
    App.wypowiedzi = [];
    App.korekty = [];
    App.startLekcji = Date.now();
    App.rozmowaTrwa = true;

    pokazWidok("rozmowa");
    rysujRozmowe();

    // Lekcja zaczyna się od słuchania — lektor mówi, uczeń odpowiada
    if (lekcja.pierwszaKwestia) {
      dodajDymek("ai", lekcja.pierwszaKwestia);
      App.historiaCzatu.push({ role: "assistant", content: lekcja.pierwszaKwestia });
      mowIPodajGlos(lekcja.pierwszaKwestia);
    }
  }).catch(function (e) {
    toast(e.message, false);
  }).finally(function () {
    spinner(false);
  });
}

/* --- Rozmowa bez rąk: lektor mówi, potem sam oddaje głos uczniowi --- */

function bezRakWlaczone() {
  var ust = (App.stan && App.stan.user.ustawienia) || {};
  return ust.bezRak !== false && Mowa.obslugiwaneSluchanie();
}

function trybSluchania() {
  var ust = (App.stan && App.stan.user.ustawienia) || {};
  return ust.trybSluchania !== false;
}

function mowIPodajGlos(tekst) {
  App.ostatniaKwestia = tekst; // do powtórzenia na żądanie

  Mowa.powiedz(tekst, function () {
    // Mikrofon rusza dopiero po lektorze, żeby nie nagrał jego własnego głosu
    if (App.rozmowaTrwa && App.widok === "rozmowa" && bezRakWlaczone()) {
      sluchajUcznia();
    }
  });
}

function sluchajUcznia() {
  if (!App.rozmowaTrwa || Mowa.slucha) return;

  ustawPodpowiedz("🎤 Mów teraz po angielsku...");

  Mowa.sluchaj(
    function (tekst) {
      ustawPodpowiedz(tekst ? "„" + tekst + "”" : "🎤 Słucham...");
    },
    function (koncowy) {
      if (!App.rozmowaTrwa) return;

      if (koncowy && koncowy.trim()) {
        ustawPodpowiedz("");
        wyslijWiadomosc(koncowy.trim());
      } else {
        ustawPodpowiedz("Nie dosłyszałem — dotknij mikrofonu i powiedz jeszcze raz.");
      }
    }
  );
}

function ustawPodpowiedz(tekst) {
  var el = document.getElementById("czat-podpowiedz");
  if (el) el.textContent = tekst || "";
}

/* --- Widok lekcji --- */

function rysujRozmowe() {
  var brak = document.getElementById("rozmowa-brak");
  var tresc = document.getElementById("rozmowa-tresc");

  if (!App.lekcja) {
    brak.hidden = false;
    tresc.hidden = true;
    document.getElementById("czat-wejscie").hidden = true;
    return;
  }

  brak.hidden = true;
  tresc.hidden = false;
  document.getElementById("czat-wejscie").hidden = App.widok !== "rozmowa";

  var l = App.lekcja;

  // Materiał jest zwinięty. Czytanie to dodatek, nie punkt wyjścia.
  document.getElementById("rozmowa-material").innerHTML =
    "<h3>Day " + l.dzien + "</h3>" +
    '<h2 style="font-size:17px">' + esc(l.temat) + "</h2>" +
    (l.zadanieUcznia
      ? '<p style="margin-top:6px"><b>Your task:</b> ' + esc(l.zadanieUcznia) + "</p>"
      : "") +
    (l.wskazowka ? '<p class="podpis" style="margin-top:6px">💡 ' + esc(l.wskazowka) + "</p>" : "") +

    "<details style='margin-top:10px'><summary>Words for today (" + (l.slownictwo || []).length + ")</summary>" +
    (l.slownictwo || []).map(function (s) {
      return '<div class="pozycja"><div class="tresc"><b>' + esc(s.en) + "</b>" +
        "<small>" + esc(s.pl) + (s.przyklad ? " · " + esc(s.przyklad) : "") + "</small></div>" +
        '<button class="btn maly drugi" data-mow="' + esc(s.przyklad || s.en) + '">🔊</button></div>';
    }).join("") + "</details>" +

    ((l.struktury || []).length
      ? "<details><summary>Phrases to use</summary>" +
        (l.struktury || []).map(function (s) {
          return '<div class="pozycja"><div class="tresc"><b>' + esc(s) + "</b></div>" +
            '<button class="btn maly drugi" data-mow="' + esc(s) + '">🔊</button></div>';
        }).join("") + "</details>"
      : "") +

    ((l.pytaniaPomocnicze || []).length
      ? "<details><summary>Stuck? Try these</summary>" +
        (l.pytaniaPomocnicze || []).map(function (p) {
          return '<div class="pozycja"><div class="tresc">' + esc(p) + "</div>" +
            '<button class="btn maly drugi" data-mow="' + esc(p) + '">🔊</button></div>';
        }).join("") + "</details>"
      : "");

  document.getElementById("rozmowa-material").querySelectorAll("[data-mow]").forEach(function (b) {
    b.onclick = function () { Mowa.powiedz(b.dataset.mow); };
  });
}

/* --- Dymki --- */

function dodajDymek(kto, tekst) {
  var lista = document.getElementById("czat-lista");
  var el = document.createElement("div");
  el.className = "dymek " + (kto === "ai" ? "ai" : "ja");

  if (kto === "ai") {
    var zakryty = trybSluchania();

    el.innerHTML =
      '<span class="tekst-ai"' + (zakryty ? ' hidden' : '') + ">" + esc(tekst) + "</span>" +
      (zakryty ? '<span class="zakryte">👂 Słuchaj — dotknij, żeby zobaczyć tekst</span>' : "") +
      '<button class="glosnik" title="Powtórz">🔊</button>';

    el.querySelector(".glosnik").onclick = function (zdarzenie) {
      zdarzenie.stopPropagation();
      Mowa.powiedz(tekst);
    };

    if (zakryty) {
      el.onclick = function () {
        el.querySelector(".tekst-ai").hidden = false;
        var etykieta = el.querySelector(".zakryte");
        if (etykieta) etykieta.remove();
        el.onclick = null;
      };
    }
  } else {
    el.textContent = tekst;
  }

  lista.appendChild(el);
  przewinNaDol();
  return el;
}

function dodajKorekte(korekta) {
  if (!korekta || !korekta.powinno) return;

  var el = document.createElement("div");
  el.className = "korekta";
  el.innerHTML = "<b>✎ Drobna poprawka</b>" +
    (korekta.bylo ? '<div class="bylo">' + esc(korekta.bylo) + "</div>" : "") +
    '<div class="powinno">' + esc(korekta.powinno) + ' <button class="glosnik" data-mow="' + esc(korekta.powinno) + '">🔊</button></div>' +
    (korekta.dlaczego ? '<div class="czemu">' + esc(korekta.dlaczego) + "</div>" : "");

  el.querySelectorAll("[data-mow]").forEach(function (b) {
    b.onclick = function () { Mowa.powiedz(b.dataset.mow); };
  });

  document.getElementById("czat-lista").appendChild(el);
  App.korekty.push(korekta);
  przewinNaDol();
}

function przewinNaDol() {
  requestAnimationFrame(function () {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

/* --- Wysyłka --- */

async function wyslijWiadomosc(tekstZMowy) {
  var pole = document.getElementById("czat-pole");
  var tekst = (tekstZMowy || pole.value || "").trim();
  if (!tekst || !App.lekcja) return;

  Mowa.stop();
  pole.value = "";
  pole.style.height = "auto";

  dodajDymek("ja", tekst);
  App.wypowiedzi.push(tekst);

  var pisze = document.createElement("div");
  pisze.className = "dymek ai pisze";
  pisze.textContent = "...";
  document.getElementById("czat-lista").appendChild(pisze);
  przewinNaDol();

  document.getElementById("btn-wyslij").disabled = true;

  try {
    var odp = await Api.wyslij("/api/czat", {
      dzien: App.lekcja.dzien,
      temat: App.lekcja.temat,
      scenariusz: App.lekcja.scenariusz,
      historia: App.historiaCzatu,
      wiadomosc: tekst,
    });

    pisze.remove();

    App.historiaCzatu.push({ role: "user", content: tekst });
    App.historiaCzatu.push({ role: "assistant", content: odp.odpowiedz });

    dodajDymek("ai", odp.odpowiedz);
    if (odp.korekta) dodajKorekte(odp.korekta);

    // Lektor mówi, a po nim mikrofon sam wraca do ucznia
    mowIPodajGlos(odp.odpowiedz);

    for (var i = 0; i < (odp.noweSlowa || []).length; i++) {
      var s = odp.noweSlowa[i];
      if (!s || !s.en) continue;
      try {
        await Api.wyslij("/api/slowka", { en: s.en, pl: s.pl || "" });
      } catch (e) {
        // Słówko to dodatek — nie przerywamy rozmowy, gdy się nie zapisze
      }
    }
  } catch (e) {
    pisze.remove();
    toast(e.message, false);
    pole.value = tekst; // wypowiedź nie przepada
  } finally {
    document.getElementById("btn-wyslij").disabled = false;
  }
}

/* --- Zakończenie --- */

async function zakonczLekcje() {
  if (!App.lekcja) return;

  if (!App.wypowiedzi.length) {
    toast("Powiedz coś, zanim zakończysz.", false);
    return;
  }

  App.rozmowaTrwa = false;
  Mowa.stop();
  Mowa.cisza();
  ustawPodpowiedz("");
  spinner(true, "Podsumowuję rozmowę...");

  try {
    var wynik = await Api.wyslij("/api/lekcja/" + App.lekcja.dzien + "/koniec", {
      wypowiedzi: App.wypowiedzi,
      korekty: App.korekty,
      czasSek: Math.round((Date.now() - App.startLekcji) / 1000),
    });

    App.stan = wynik.stan;
    App.lekcja = null;
    App.historiaCzatu = [];
    App.wypowiedzi = [];
    App.korekty = [];

    odswiezOdznaki();
    pokazPodsumowanie(wynik);
  } catch (e) {
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

function pokazPodsumowanie(wynik) {
  var p = wynik.podsumowanie || {};

  document.getElementById("czat-lista").innerHTML = "";
  document.getElementById("czat-wejscie").hidden = true;
  document.getElementById("rozmowa-tresc").hidden = true;
  document.getElementById("rozmowa-brak").hidden = true;

  var widok = document.getElementById("w-rozmowa");
  var blok = document.createElement("div");
  blok.className = "karta akcent";
  blok.id = "blok-podsumowania";
  blok.innerHTML =
    '<div class="srodek" style="font-size:40px">🎉</div>' +
    '<h2 class="srodek" style="font-size:20px">+' + wynik.xp + " XP</h2>" +
    '<p class="podpis srodek" style="margin-bottom:12px">Ocena rozmowy: ' + (p.ocena || 0) + " / 100</p>" +
    (p.komentarz ? "<p>" + esc(p.komentarz) + "</p>" : "") +
    ((p.mocne || []).length
      ? '<h3 style="margin-top:14px">Poszło dobrze</h3><div class="tagi">' +
        p.mocne.map(function (m) { return '<span class="tag mocny">' + esc(m) + "</span>"; }).join("") + "</div>"
      : "") +
    ((p.doPoprawy || []).length
      ? '<h3 style="margin-top:14px">Do poprawy</h3><div class="tagi">' +
        p.doPoprawy.map(function (m) { return '<span class="tag slaby">' + esc(m) + "</span>"; }).join("") + "</div>"
      : "") +
    ((p.nowaSlowka || []).length
      ? '<h3 style="margin-top:14px">Dodane do powtórek</h3>' +
        p.nowaSlowka.map(function (s) {
          return '<div class="pozycja"><div class="tresc"><b>' + esc(s.en) + "</b><small>" + esc(s.pl) + "</small></div>" +
            '<button class="btn maly drugi" data-mow="' + esc(s.en) + '">🔊</button></div>';
        }).join("")
      : "") +
    '<button class="btn" id="btn-wroc-dzis" style="margin-top:14px">Gotowe</button>';

  var stare = document.getElementById("blok-podsumowania");
  if (stare) stare.remove();
  widok.insertBefore(blok, widok.firstChild);

  blok.querySelectorAll("[data-mow]").forEach(function (b) {
    b.onclick = function () { Mowa.powiedz(b.dataset.mow); };
  });

  document.getElementById("btn-wroc-dzis").onclick = function () {
    blok.remove();
    document.getElementById("rozmowa-brak").hidden = false;
    pokazWidok("dzis");
  };

  window.scrollTo(0, 0);
}

/* --- Podpięcie --- */

function podepnijRozmowe() {
  var pole = document.getElementById("czat-pole");

  document.getElementById("btn-wyslij").onclick = function () { wyslijWiadomosc(); };
  document.getElementById("btn-zakoncz-lekcje").onclick = zakonczLekcje;

  pole.onkeydown = function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      wyslijWiadomosc();
    }
  };

  pole.oninput = function () {
    pole.style.height = "auto";
    pole.style.height = Math.min(110, pole.scrollHeight) + "px";
  };

  // Mikrofon: dotknięcie w trakcie słuchania kończy wypowiedź,
  // dotknięcie w ciszy — zaczyna ją od nowa
  document.getElementById("btn-mikrofon").onclick = function () {
    if (Mowa.slucha) {
      Mowa.stop();
    } else {
      Mowa.cisza();
      sluchajUcznia();
    }
  };

  // Klawiatura jest schowana — pisanie to wyjście awaryjne, nie domyślny tryb
  var przelacznik = document.getElementById("btn-klawiatura");
  if (przelacznik) {
    przelacznik.onclick = function () {
      var widoczna = document.getElementById("czat-wejscie").classList.toggle("z-klawiatura");
      if (widoczna) setTimeout(function () { pole.focus(); }, 50);
    };
  }

  // Powtórzenie ostatniej kwestii — przy nauce ze słuchu używane najczęściej
  var powtorz = document.getElementById("btn-powtorz");
  if (powtorz) {
    powtorz.onclick = function () {
      if (!App.ostatniaKwestia) return;
      Mowa.stop();
      mowIPodajGlos(App.ostatniaKwestia);
    };
  }
}

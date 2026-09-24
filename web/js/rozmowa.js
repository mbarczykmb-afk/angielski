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
    App.matura = null;
    App.odbierzWypowiedz = function (tekst) { wyslijWiadomosc(tekst); };
    App.historiaCzatu = [];
    App.wypowiedzi = [];
    App.korekty = [];
    App.startLekcji = Date.now();
    App.rozmowaTrwa = true;
    App.celeZrobione = [];
    App.pomoc = null;

    var stare = document.getElementById("blok-podsumowania");
    if (stare) stare.remove();

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

  // Czas wypowiedzi mierzymy od włączenia mikrofonu — na maturze służy
  // do oceny płynności, bo to jedyna rzecz, którą da się tu zmierzyć
  var poczatek = Date.now();
  haptyka();

  Mowa.sluchaj(
    function (tekst) {
      ustawPodpowiedz(tekst ? "„" + tekst + "”" : "🎤 Słucham...");
    },
    function (koncowy) {
      if (!App.rozmowaTrwa) return;
      haptyka(8);

      if (koncowy && koncowy.trim()) {
        ustawPodpowiedz("");
        App.odbierzWypowiedz(koncowy.trim(), Math.round((Date.now() - poczatek) / 1000));
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

  // Egzamin maturalny rysuje sobie własną kartę — ma inne reguły niż lekcja
  if (App.matura) {
    rysujKarteMatury();
    return;
  }

  document.getElementById("btn-zakoncz-lekcje").textContent = "✓ Zakończ lekcję i podsumuj";

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
  Awatar.pokaz("lektor");
  document.getElementById("btn-pomoc").hidden = false;
  document.getElementById("btn-tlumacz").hidden = false;

  // Materiał jest zwinięty. Czytanie to dodatek, nie punkt wyjścia.
  document.getElementById("rozmowa-material").innerHTML =
    "<h3>" + esc(l.temat) + "</h3>" +
    // Trzy cele odhaczane w trakcie rozmowy, jak zadania w roleplayu Speak:
    // widać postęp i wiadomo, kiedy rozmowę można uczciwie zakończyć.
    // Starsze lekcje zapisane przed tą zmianą mają tylko jedno zdanie zadania.
    ((l.cele || []).length
      ? "<b>Your goals</b>" + '<ul class="cele" id="lista-celow">' + listaCelow(l.cele) + "</ul>"
      : (l.zadanieUcznia ? "<p><b>Your task:</b> " + esc(l.zadanieUcznia) + "</p>" : "")) +
    (l.wskazowka ? '<p class="podpis" style="margin-top:8px">' + ik("cel") + " " + esc(l.wskazowka) + "</p>" : "") +

    "<details style='margin-top:10px'><summary>Words for today (" + (l.slownictwo || []).length + ")</summary>" +
    (l.slownictwo || []).map(function (s) {
      return '<div class="pozycja"><div class="tresc"><b>' + esc(s.en) + "</b>" +
        "<small>" + esc(s.pl) + (s.przyklad ? " · " + esc(s.przyklad) : "") + "</small></div>" +
        '<button class="btn-cichy" data-mow="' + esc(s.przyklad || s.en) + '" aria-label="Posłuchaj">' + ik("glosnik") + "</button></div>";
    }).join("") + "</details>" +

    ((l.struktury || []).length
      ? "<details><summary>Phrases to use</summary>" +
        (l.struktury || []).map(function (s) {
          return '<div class="pozycja"><div class="tresc"><b>' + esc(s) + "</b></div>" +
            '<button class="btn-cichy" data-mow="' + esc(s) + '" aria-label="Posłuchaj">' + ik("glosnik") + "</button></div>";
        }).join("") + "</details>"
      : "") +

    ((l.pytaniaPomocnicze || []).length
      ? "<details><summary>Stuck? Try these</summary>" +
        (l.pytaniaPomocnicze || []).map(function (p) {
          return '<div class="pozycja"><div class="tresc">' + esc(p) + "</div>" +
            '<button class="btn-cichy" data-mow="' + esc(p) + '" aria-label="Posłuchaj">' + ik("glosnik") + "</button></div>";
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

    el.dataset.tekst = tekst;
    el.innerHTML =
      '<span class="tekst-ai"' + (zakryty ? ' hidden' : '') + ">" + esc(tekst) + "</span>" +
      (zakryty ? '<span class="zakryte">' + fala() + "Dotknij, żeby zobaczyć tekst</span>" : "") +
      '<button class="glosnik" aria-label="Posłuchaj jeszcze raz">' + ik("glosnik") + "</button>";

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
  el.innerHTML = "<b>" + ik("olowek") + "Drobna poprawka</b>" +
    (korekta.bylo ? '<div class="bylo">' + esc(korekta.bylo) + "</div>" : "") +
    '<div class="powinno">' + esc(korekta.powinno) + ' <button class="glosnik" data-mow="' + esc(korekta.powinno) + '" aria-label="Posłuchaj">' + ik("glosnik") + "</button></div>" +
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

/* --- Powtarzanie za wzorem --- */

function rozpocznijPowtarzanie(fraza) {
  App.doPowtorzenia = fraza;
  App.probyPowtorzenia = 0;
  pokazWzor(fraza);
  odtworzWzorISluchaj();
}

function pokazWzor(fraza) {
  var el = document.createElement("div");
  el.className = "wzor";
  el.id = "wzor-biezacy";
  el.innerHTML =
    "<b>" + ik("powtorz") + "Powtórz za mną</b>" +
    '<div class="fraza">' + esc(fraza) + "</div>" +
    '<button class="btn drugi maly" data-mow-wolno="' + esc(fraza) + '">' + ik("glosnik") + "Jeszcze raz wolniej</button>";

  el.querySelector("[data-mow-wolno]").onclick = function () {
    Mowa.stop();
    Mowa.powiedz(fraza, null, true);
  };

  document.getElementById("czat-lista").appendChild(el);
  przewinNaDol();
}

function odtworzWzorISluchaj() {
  Mowa.powiedz(App.doPowtorzenia, function () {
    if (App.rozmowaTrwa && App.doPowtorzenia) sluchajPowtorki();
  }, true);
}

function sluchajPowtorki() {
  ustawPodpowiedz("🔁 Powiedz: " + App.doPowtorzenia);

  Mowa.sluchaj(
    function (tekst) {
      ustawPodpowiedz(tekst ? "„" + tekst + "”" : "🔁 Słucham...");
    },
    function (koncowy) {
      if (!App.rozmowaTrwa || !App.doPowtorzenia) return;
      ocenPowtorke((koncowy || "").trim());
    }
  );
}

function ocenPowtorke(powiedziane) {
  var wzor = App.doPowtorzenia;
  var trafnosc = podobienstwo(powiedziane, wzor);
  App.probyPowtorzenia++;

  var karta = document.getElementById("wzor-biezacy");
  ustawPodpowiedz("");

  // Dymka z wypowiedzią NIE dodajemy tutaj — zrobi to wyslijWiadomosc,
  // inaczej powtórzenie pojawiłoby się w rozmowie dwa razy

  // 70% słów wzoru wystarczy — rozpoznawanie mowy gubi drobiazgi,
  // a chodzi o wypowiedzenie frazy, nie o dyktando
  if (trafnosc >= 0.7) {
    if (karta) karta.classList.add("udane");
    Awatar.ustawEmocje("radosc", 4000);
    zakonczPowtarzanie();
    wyslijWiadomosc(powiedziane, true);
    return;
  }

  if (App.probyPowtorzenia < 2) {
    if (karta) {
      var wskazowka = karta.querySelector(".uwaga-wzoru");
      if (!wskazowka) {
        wskazowka = document.createElement("div");
        wskazowka.className = "uwaga-wzoru";
        karta.appendChild(wskazowka);
      }
      wskazowka.textContent = "Prawie. Posłuchaj jeszcze raz i powtórz.";
    }
    odtworzWzorISluchaj();
    return;
  }

  // Po dwóch próbach wracamy do rozmowy. Utknięcie na jednej frazie
  // zniechęca bardziej, niż pomaga jej opanowanie.
  if (karta) {
    var koniec = document.createElement("div");
    koniec.className = "uwaga-wzoru";
    koniec.textContent = "Wrócimy do tego później — jedziemy dalej.";
    karta.appendChild(koniec);
  }
  zakonczPowtarzanie();
  // Gdy nic nie udało się rozpoznać, nie wysyłamy wzoru jako słów ucznia —
  // w zapisie rozmowy byłoby to nieprawdą. Zamiast tego prosimy o dalszy ciąg.
  wyslijWiadomosc(powiedziane || "Let's move on, please.", true);
}

function zakonczPowtarzanie() {
  App.doPowtorzenia = "";
  App.probyPowtorzenia = 0;
  var karta = document.getElementById("wzor-biezacy");
  if (karta) karta.removeAttribute("id");
}

/* --- Wysyłka --- */

async function wyslijWiadomosc(tekstZMowy, powtorzenie) {
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
  Awatar.ustawStan("mysli");

  try {
    var odp = await Api.wyslij("/api/czat", {
      dzien: App.lekcja.dzien,
      temat: App.lekcja.temat,
      scenariusz: App.lekcja.scenariusz,
      historia: App.historiaCzatu,
      wiadomosc: tekst,
      // Serwer wie, że to powtórka za wzorem — pochwali i wróci do rozmowy,
      // zamiast poprawiać powtórzenie i prosić o kolejne
      powtorzenie: !!powtorzenie,
      cele: App.lekcja.cele || [],
      celeZrobione: App.celeZrobione || [],
    });

    pisze.remove();
    App.pomoc = null; // nowa kwestia lektora — stara podpowiedź jest już nieaktualna
    schowajPodpowiedzi();
    // Mina lektora: emocja od modelu, a bez niej troska przy poprawce i spokój poza tym
    Awatar.ustawStan("czeka");
    Awatar.ustawEmocje(odp.emocja || (odp.korekta ? "troska" : "neutralna"));
    odswiezCele(odp.celeZrobione);

    App.historiaCzatu.push({ role: "user", content: tekst });
    App.historiaCzatu.push({ role: "assistant", content: odp.odpowiedz });

    dodajDymek("ai", odp.odpowiedz);
    if (odp.korekta) dodajKorekte(odp.korekta);

    if (odp.doPowtorzenia) {
      // Lektor poprosił o powtórzenie — rozmowa czeka, aż uczeń wypowie wzór
      App.ostatniaKwestia = odp.odpowiedz;
      Mowa.powiedz(odp.odpowiedz, function () { rozpocznijPowtarzanie(odp.doPowtorzenia); });
    } else {
      // Lektor mówi, a po nim mikrofon sam wraca do ucznia
      mowIPodajGlos(odp.odpowiedz);
    }

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
    Awatar.ustawStan("czeka");
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
  App.doPowtorzenia = "";
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
  Awatar.schowaj();

  document.getElementById("czat-lista").innerHTML = "";
  document.getElementById("czat-wejscie").hidden = true;
  document.getElementById("btn-zakoncz-gora").hidden = true;
  document.getElementById("rozmowa-tresc").hidden = true;
  document.getElementById("rozmowa-brak").hidden = true;

  var widok = document.getElementById("w-rozmowa");
  var blok = document.createElement("div");
  blok.className = "karta akcent";
  blok.id = "blok-podsumowania";
  blok.innerHTML =
    '<div class="srodek" style="color:var(--zolty)">' + ik("puchar", "duza") + "</div>" +
    '<h2 class="srodek" style="font-size:20px">+' + wynik.xp + " XP</h2>" +
    '<p class="podpis srodek" style="margin-bottom:12px">Ocena rozmowy: ' + (p.ocena || 0) + " / 100</p>" +
    (p.komentarz ? "<p>" + esc(p.komentarz) + "</p>" : "") +

    // Konkretne bledy z cytatem i poprawna wersja — to z nich uczen wynosi najwiecej
    ((p.bledy || []).length
      ? '<h3 style="margin-top:16px">Twoje błędy (' + p.bledy.length + ")</h3>" +
        p.bledy.map(function (b) {
          return '<div class="blad">' +
            (b.bylo ? '<div class="bylo">' + esc(b.bylo) + "</div>" : "") +
            '<div class="powinno">' + esc(b.powinno || "") +
            ' <button class="glosnik" data-mow="' + esc(b.powinno || "") + '" aria-label="Posłuchaj">' + ik("glosnik") + "</button></div>" +
            (b.dlaczego ? '<div class="czemu">' + esc(b.dlaczego) + "</div>" : "") +
            "</div>";
        }).join("")
      : '<p class="podpis" style="margin-top:14px">' + ik("ok") + " Bez istotnych błędów w tej rozmowie.</p>") +

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
            '<button class="btn-cichy" data-mow="' + esc(s.en) + '" aria-label="Posłuchaj">' + ik("glosnik") + "</button></div>";
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

/* --- Cele lekcji --- */

// Mała fala dźwiękowa zamiast ikony ucha — mówi "tu jest nagranie", nie "przeczytaj"
function fala() {
  return '<span class="fala">' +
    [6, 12, 16, 9, 13, 7].map(function (h) { return '<i style="height:' + h + 'px"></i>'; }).join("") +
    "</span>";
}

function listaCelow(cele) {
  var zrobione = App.celeZrobione || [];
  return cele.map(function (c, i) {
    return '<li data-cel="' + i + '"' + (zrobione.indexOf(i) > -1 ? ' class="zrobiony"' : "") + ">" +
      '<span class="znak">' + ik("ok") + '</span><span class="opis">' + esc(c) + "</span></li>";
  }).join("");
}

function odswiezCele(nowe) {
  if (!Array.isArray(nowe) || !App.lekcja || !(App.lekcja.cele || []).length) return;

  var przed = App.celeZrobione || [];
  var swieze = nowe.filter(function (n) { return przed.indexOf(n) < 0; });
  App.celeZrobione = nowe.slice();

  document.querySelectorAll("#lista-celow li").forEach(function (li) {
    li.classList.toggle("zrobiony", nowe.indexOf(Number(li.dataset.cel)) > -1);
  });

  if (!swieze.length) return;
  haptyka([15, 60, 15]);
  Awatar.ustawEmocje("radosc", 5000);

  if (nowe.length >= App.lekcja.cele.length) {
    toast("Wszystkie cele zrobione! Możesz zakończyć albo gadać dalej.");
  } else {
    toast("Cel zaliczony: " + App.lekcja.cele[swieze[0]]);
  }
}

/* --- Pomoc w rozmowie: tłumaczenie i propozycje odpowiedzi --- */

async function pobierzPomoc() {
  var kwestia = App.ostatniaKwestia;
  if (!kwestia) {
    toast("Lektor jeszcze nic nie powiedział.", false);
    return null;
  }

  // Jedna odpowiedź serwera obsługuje oba przyciski — nie płacimy dwa razy
  if (App.pomoc && App.pomoc.dla === kwestia) return App.pomoc.dane;

  ustawPodpowiedz("Szukam podpowiedzi...");
  try {
    var dane = await Api.wyslij("/api/czat/pomoc", {
      kwestia: kwestia,
      temat: App.lekcja && App.lekcja.temat,
      scenariusz: App.lekcja && App.lekcja.scenariusz,
    });
    App.pomoc = { dla: kwestia, dane: dane };
    return dane;
  } catch (e) {
    toast(e.message, false);
    return null;
  } finally {
    ustawPodpowiedz("");
  }
}

function ostatniDymekLektora() {
  var dymki = document.querySelectorAll("#czat-lista .dymek.ai:not(.pisze)");
  return dymki.length ? dymki[dymki.length - 1] : null;
}

async function pokazTlumaczenie() {
  Mowa.stop();
  var dane = await pobierzPomoc();
  if (!dane || !dane.tlumaczenie) return;

  var dymek = ostatniDymekLektora();
  if (!dymek) return;

  // Tłumaczenie bez oryginału byłoby dziwne — odsłaniamy oba
  var tekst = dymek.querySelector(".tekst-ai");
  if (tekst) tekst.hidden = false;
  var zakryte = dymek.querySelector(".zakryte");
  if (zakryte) zakryte.remove();

  if (!dymek.querySelector(".tlumaczenie-pl")) {
    var pl = document.createElement("span");
    pl.className = "tlumaczenie-pl";
    pl.textContent = dane.tlumaczenie;
    (tekst || dymek).appendChild(pl);
  }
  przewinNaDol();
}

async function pokazPropozycje() {
  Mowa.stop();
  var dane = await pobierzPomoc();
  if (!dane || !(dane.propozycje || []).length) return;

  schowajPodpowiedzi();

  var el = document.createElement("div");
  el.className = "podpowiedzi";
  el.id = "blok-podpowiedzi";
  el.innerHTML = "<b>" + ik("iskry") + "Możesz powiedzieć na przykład</b>" +
    dane.propozycje.map(function (p) {
      return '<button class="propozycja" data-mow="' + esc(p.en) + '"><span>' + esc(p.en) +
        "<small>" + esc(p.pl) + "</small></span>" + ik("glosnik") + "</button>";
    }).join("") +
    '<p class="mini" style="margin-top:8px">Posłuchaj i powiedz po swojemu — przepisywanie nie uczy mówienia.</p>';

  el.querySelectorAll("[data-mow]").forEach(function (b) {
    b.onclick = function () {
      Mowa.stop();
      Mowa.powiedz(b.dataset.mow, null, true);
    };
  });

  document.getElementById("czat-lista").appendChild(el);
  ustawPodpowiedz("Dotknij mikrofonu, gdy będziesz gotów.");
  przewinNaDol();
}

function schowajPodpowiedzi() {
  var stary = document.getElementById("blok-podpowiedzi");
  if (stary) stary.remove();
}

/* --- Podpięcie --- */

// Pasek wprowadzania i przycisk zakończenia są wspólne dla kursu i matury,
// więc kierujemy je tam, gdzie akurat trwa sesja
function wyslijZPola() {
  var pole = document.getElementById("czat-pole");
  var tekst = pole.value.trim();
  if (!tekst) return;
  App.odbierzWypowiedz(tekst, 0);
}

function zakonczSesje() {
  if (App.matura) zakonczMature();
  else zakonczLekcje();
}

function podepnijRozmowe() {
  var pole = document.getElementById("czat-pole");

  document.getElementById("btn-wyslij").onclick = wyslijZPola;
  document.getElementById("btn-zakoncz-lekcje").onclick = zakonczSesje;
  document.getElementById("btn-zakoncz-gora").onclick = zakonczSesje;

  pole.onkeydown = function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      wyslijZPola();
    }
  };

  pole.oninput = function () {
    pole.style.height = "auto";
    pole.style.height = Math.min(110, pole.scrollHeight) + "px";
  };

  // Mikrofon: dotknięcie w trakcie słuchania kończy wypowiedź,
  // dotknięcie w ciszy — zaczyna ją od nowa
  // Podpowiedzi zostają na ekranie w trakcie mówienia — po to są.
  // Znikają dopiero, gdy lektor odpowie i zrobią się nieaktualne.
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

  // Utknąłem: propozycje odpowiedzi i tłumaczenie ostatniej kwestii.
  // Oba z jednego zapytania, które zostaje w pamięci do następnej kwestii lektora.
  document.getElementById("btn-pomoc").onclick = pokazPropozycje;
  document.getElementById("btn-tlumacz").onclick = pokazTlumaczenie;
}

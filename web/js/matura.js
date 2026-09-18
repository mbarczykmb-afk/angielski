/* ============================================================
   Matura ustna z języka angielskiego — moduł egzaminacyjny

   Osobny tryb aplikacji, przełączany na górze zakładki "Dziś".
   Kurs 30 dni uczy rozmawiać; ten moduł uczy zdać konkretny egzamin,
   więc reguły są inne: egzaminator nie poprawia, nie podpowiada
   i nie chwali — cała informacja zwrotna przychodzi po zakończeniu,
   razem z punktacją według kryteriów CKE.

   Karta z zadaniem jest tu WIDOCZNA, w odróżnieniu od zwykłej rozmowy.
   Na prawdziwym egzaminie zdający też ma zestaw przed oczami — ukrywanie
   go zmieniałoby zadanie w coś innego niż egzamin.
   ============================================================ */

var Matura = {
  dane: null,      // ostatnio pobrany stan modułu
  minutnik: null,  // uchwyt odliczania czasu egzaminu
};

/* --- Wybór modułu --- */

function modulAktywny() {
  var ust = (App.stan && App.stan.user.ustawienia) || {};
  return ust.modul === "matura" ? "matura" : "kurs";
}

function ustawModul(nazwa) {
  if (!App.stan) return;
  if (modulAktywny() === nazwa) return;

  // Przełączenie w trakcie sesji zostawiłoby ją w zawieszeniu — najpierw koniec
  if (sesjaTrwa()) {
    toast(App.matura ? "Najpierw zakończ egzamin." : "Najpierw zakończ lekcję.", false);
    pokazWidok("rozmowa");
    return;
  }

  App.stan.user.ustawienia = App.stan.user.ustawienia || {};
  App.stan.user.ustawienia.modul = nazwa;

  // Zapis w tle — przełączenie ma być natychmiastowe, a nie czekać na serwer
  Api.wyslij("/api/ustawienia", {
    ustawienia: Object.assign({}, App.stan.user.ustawienia, { celDzienny: App.stan.user.celDzienny }),
  }).catch(function () {
    // Bez sieci wybór zostaje na tę sesję — to nie powód, żeby straszyć błędem
  });

  pokazWidok("dzis");
}

function przelacznikModulu() {
  var m = modulAktywny();
  return '<div class="przelacz-modul">' +
    '<button data-modul="kurs"' + (m === "kurs" ? ' class="aktywny"' : "") + ">Kurs 30 dni</button>" +
    '<button data-modul="matura"' + (m === "matura" ? ' class="aktywny"' : "") + ">🎓 Matura ustna</button>" +
    "</div>";
}

function podepnijPrzelacznikModulu(widok) {
  widok.querySelectorAll(".przelacz-modul button").forEach(function (b) {
    b.onclick = function () { ustawModul(b.dataset.modul); };
  });
}

/* --- Pulpit modułu --- */

function rysujMature() {
  var widok = document.getElementById("w-dzis");
  widok.innerHTML = przelacznikModulu() + '<div class="pusto">Wczytuję wyniki...</div>';
  podepnijPrzelacznikModulu(widok);

  Api.pobierz("/api/matura").then(function (dane) {
    Matura.dane = dane;
    if (App.widok === "dzis" && modulAktywny() === "matura") rysujPulpitMatury(dane);
  }).catch(function (e) {
    if (App.widok !== "dzis") return;
    widok.innerHTML = przelacznikModulu() +
      '<div class="karta"><h3>Nie udało się wczytać modułu</h3>' +
      '<p class="podpis">' + esc(e.message) + "</p>" +
      '<p class="mini" style="margin-top:8px">Jeśli to pierwsze uruchomienie matury, ' +
      "serwer potrzebuje jeszcze migracji bazy <code>002-matura.sql</code>.</p></div>";
    podepnijPrzelacznikModulu(widok);
  });
}

function rysujPulpitMatury(d) {
  var widok = document.getElementById("w-dzis");
  var ocenione = (d.podejscia || []).filter(function (p) { return p.status === "zakonczony"; });

  var html = przelacznikModulu();

  /* --- Start egzaminu --- */

  html += '<div class="karta akcent">' +
    "<h3>Egzamin ustny — próba</h3>" +
    '<h2 style="font-size:19px;margin-bottom:6px">Zestaw jak na maturze</h2>' +
    '<p class="podpis">Egzaminator mówi tylko po angielsku, nie poprawia i nie podpowiada — ' +
    "dokładnie jak na sali. Punkty i wszystkie błędy dostajesz na końcu.</p>" +

    '<label for="pole-tryb-matury" style="margin-top:12px">Co ćwiczymy</label>' +
    '<select id="pole-tryb-matury">' +
    '<option value="pelny">Pełny egzamin — 3 zadania, ok. 15 min, 30 pkt</option>' +
    '<option value="zadanie1">Tylko zadanie 1 — rozmowa z odgrywaniem roli</option>' +
    '<option value="zadanie2">Tylko zadanie 2 — opis ilustracji</option>' +
    '<option value="zadanie3">Tylko zadanie 3 — materiał stymulujący</option>' +
    "</select>" +

    '<label for="pole-obszar-matury">Zakres tematyczny</label>' +
    '<select id="pole-obszar-matury"><option value="">Losowy</option>' +
    (d.obszary || []).map(function (o) {
      return '<option value="' + esc(o) + '">' + esc(o) + "</option>";
    }).join("") +
    "</select>" +

    '<button class="btn" id="btn-start-matury" style="margin-top:12px">▶ Rozpocznij egzamin</button>' +
    '<p class="mini" style="margin-top:6px">Przed startem sprawdź, czy jesteś w cichym miejscu — ' +
    "egzamin trwa bez przerwy, tak jak prawdziwy.</p></div>";

  /* --- Wyniki --- */

  if (ocenione.length) {
    html += '<div class="karta"><div class="statystyki">' +
      '<div class="statystyka"><b>' + ocenione.length + "</b><span>podejść</span></div>" +
      '<div class="statystyka"><b style="color:var(--zielony2)">' + d.najlepszy + "/30</b><span>najlepszy</span></div>" +
      '<div class="statystyka"><b style="color:var(--niebieski)">' + d.srednia + "%</b><span>średnio</span></div>" +
      "</div></div>";
  }

  if ((d.doPoprawy || []).length) {
    html += '<div class="karta" style="border-color:var(--zolty)">' +
      "<h3>Nad czym pracować przed egzaminem</h3><div class=\"tagi\">" +
      d.doPoprawy.map(function (t) { return '<span class="tag slaby">' + esc(t) + "</span>"; }).join("") +
      "</div></div>";
  }

  /* --- Jak wygląda egzamin --- */

  html += '<div class="karta"><h3>Jak wygląda ten egzamin</h3>' +
    '<div class="kryterium"><span>Rozmowa wstępna</span><b>ok. 2 min</b></div>' +
    '<p class="mini">Kilka pytań o Ciebie. Nieoceniane osobno, ale to pierwsze wrażenie.</p>' +
    '<div class="kryterium"><span>Zadanie 1 — rozmowa z odgrywaniem roli</span><b>6 pkt</b></div>' +
    '<p class="mini">Cztery elementy z polecenia. Każdy trzeba omówić i rozwinąć.</p>' +
    '<div class="kryterium"><span>Zadanie 2 — opis ilustracji i 3 pytania</span><b>6 pkt</b></div>' +
    '<p class="mini">Najpierw pełny opis, potem odpowiedzi na pytania egzaminatora.</p>' +
    '<div class="kryterium"><span>Zadanie 3 — materiał stymulujący i 2 pytania</span><b>6 pkt</b></div>' +
    '<p class="mini">Wybór jednej z dwóch propozycji, uzasadnienie wyboru i odrzucenia drugiej.</p>' +
    "<hr>" +
    '<div class="kryterium"><span>Zakres struktur leksykalno-gramatycznych</span><b>4 pkt</b></div>' +
    '<div class="kryterium"><span>Poprawność struktur</span><b>4 pkt</b></div>' +
    '<div class="kryterium"><span>Wymowa</span><b>2 pkt</b></div>' +
    '<div class="kryterium"><span>Płynność wypowiedzi</span><b>2 pkt</b></div>' +
    '<div class="kryterium razem"><span>Razem</span><b>30 pkt</b></div>' +
    '<p class="mini" style="margin-top:8px">Do zdania wystarczy 30%, czyli 9 punktów.</p></div>';

  /* --- Historia --- */

  if ((d.podejscia || []).length) {
    html += '<div class="karta"><h3>Twoje podejścia</h3>' +
      d.podejscia.map(function (p) {
        var etykieta = p.status === "zakonczony"
          ? p.punkty + "/" + p.maks + " · " + p.procent + "%"
          : "przerwane";
        var klasa = p.status !== "zakonczony" ? "" : (p.procent >= 30 ? "mocny" : "slaby");
        return '<div class="pozycja" data-podejscie="' + esc(p.id) + '">' +
          '<div class="tresc"><b>' + esc(p.temat || p.obszar || "Zestaw") + "</b>" +
          "<small>" + esc(String(p.data).slice(0, 16)) + " · " + esc(p.trybNazwa) + "</small></div>" +
          '<span class="tag ' + klasa + '">' + etykieta + "</span></div>";
      }).join("") + "</div>";
  }

  widok.innerHTML = html;
  podepnijPrzelacznikModulu(widok);

  var start = document.getElementById("btn-start-matury");
  if (start) {
    start.onclick = function () {
      startEgzaminu(
        document.getElementById("pole-tryb-matury").value,
        document.getElementById("pole-obszar-matury").value
      );
    };
  }

  widok.querySelectorAll("[data-podejscie]").forEach(function (el) {
    el.onclick = function () { pokazArchiwalne(el.dataset.podejscie); };
  });
}

async function pokazArchiwalne(id) {
  spinner(true, "Wczytuję podejście...");
  try {
    var p = await Api.pobierz("/api/matura/" + id);
    if (!p.ocena) {
      toast("To podejście nie zostało ocenione.", false);
      return;
    }
    pokazWidok("rozmowa");
    pokazWynikMatury({ ocena: p.ocena }, p);
  } catch (e) {
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

/* --- Przebieg egzaminu --- */

async function startEgzaminu(tryb, obszar) {
  spinner(true, "Losuję zestaw egzaminacyjny...");

  try {
    var sesja = await Api.wyslij("/api/matura/zestaw", { tryb: tryb, obszar: obszar });

    App.lekcja = null;
    App.matura = {
      sesjaId: sesja.sesjaId,
      tryb: sesja.tryb,
      trybNazwa: sesja.trybNazwa,
      obszar: sesja.obszar,
      zestaw: sesja.zestaw || {},
      etap: sesja.etap,
      maks: sesja.maks,
      start: Date.now(),
      wypowiedzi: 0,
    };
    App.historiaCzatu = [];
    App.rozmowaTrwa = true;
    App.odbierzWypowiedz = wyslijNaMaturze;

    document.getElementById("czat-lista").innerHTML = "";
    var stare = document.getElementById("blok-podsumowania");
    if (stare) stare.remove();
    pokazWidok("rozmowa");

    dodajDymek("ai", sesja.odpowiedz);
    mowIPodajGlos(sesja.odpowiedz);
    uruchomMinutnik();
  } catch (e) {
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

function uruchomMinutnik() {
  zatrzymajMinutnik();
  Matura.minutnik = setInterval(function () {
    var el = document.getElementById("matura-czas");
    if (!el || !App.matura) return zatrzymajMinutnik();
    var sek = Math.round((Date.now() - App.matura.start) / 1000);
    el.textContent = Math.floor(sek / 60) + ":" + String(sek % 60).padStart(2, "0");
    // Pełny egzamin trwa około 15 minut — po tym czasie licznik ostrzega
    el.classList.toggle("przekroczony", App.matura.tryb === "pelny" && sek > 900);
  }, 1000);
}

function zatrzymajMinutnik() {
  if (Matura.minutnik) clearInterval(Matura.minutnik);
  Matura.minutnik = null;
}

/* --- Karta zadania --- */

var ETYKIETY_ETAPOW = {
  wstep: "Rozmowa wstępna",
  z1: "Zadanie 1 — rozmowa z odgrywaniem roli",
  z2: "Zadanie 2 — opis ilustracji",
  z3: "Zadanie 3 — materiał stymulujący",
  koniec: "Koniec egzaminu",
};

function rysujKarteMatury() {
  var m = App.matura;
  var karta = document.getElementById("rozmowa-material");

  document.getElementById("rozmowa-brak").hidden = true;
  document.getElementById("rozmowa-tresc").hidden = false;
  // Po ostatniej kwestii egzaminatora mikrofon jest już niepotrzebny
  document.getElementById("czat-wejscie").hidden = App.widok !== "rozmowa" || m.etap === "koniec";
  document.getElementById("btn-zakoncz-lekcje").textContent = "✓ Zakończ i oceń";

  var z = m.zestaw || {};
  var html =
    '<div class="matura-gora">' +
    '<span class="odznaka poziom">🎓 ' + esc(ETYKIETY_ETAPOW[m.etap] || m.etap) + "</span>" +
    '<span class="odznaka" id="matura-czas">0:00</span></div>';

  if (m.etap === "wstep") {
    html += '<p class="podpis" style="margin-top:8px">Egzaminator zada Ci kilka pytań o Ciebie. ' +
      "Odpowiadaj pełnymi zdaniami — to już się liczy jako pierwsze wrażenie.</p>";
  }

  if (m.etap === "z1" && z.zadanie1) {
    html += '<p class="polecenie">' + esc(z.zadanie1.polecenie || "") + "</p>" +
      "<p class=\"mini\">W rozmowie musisz omówić i rozwinąć wszystkie cztery punkty:</p>" +
      '<ol class="elementy">' +
      (z.zadanie1.elementy || []).map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") +
      "</ol>";
  }

  if (m.etap === "z2" && z.zadanie2) {
    html += '<p class="polecenie">' + esc(z.zadanie2.polecenie || "") + "</p>" +
      '<div class="ilustracja"><b>🖼 Ilustracja</b><p>' + esc(z.zadanie2.ilustracja || "") + "</p>" +
      '<small>Na prawdziwym egzaminie jest tu zdjęcie. Opisz tę scenę po angielsku tak, ' +
      "jakbyś ją widział.</small></div>";
  }

  if (m.etap === "z3" && z.zadanie3) {
    html += '<p class="polecenie">' + esc(z.zadanie3.polecenie || "") + "</p>" +
      (z.zadanie3.kontekst ? '<p class="mini">' + esc(z.zadanie3.kontekst) + "</p>" : "") +
      (z.zadanie3.opcje || []).map(function (o) {
        return '<div class="opcja-matury"><b>' + esc(o.etykieta) + "</b><span>" + esc(o.opis) + "</span></div>";
      }).join("");
  }

  if (m.etap === "koniec") {
    html += '<p class="podpis" style="margin-top:8px">Egzamin zakończony. ' +
      "Dotknij „Zakończ i oceń”, żeby zobaczyć punktację i błędy.</p>";
  } else {
    html += '<button class="btn drugi maly" id="btn-matura-dalej" style="margin-top:12px;width:100%">' +
      "Przejdź do następnej części →</button>" +
      '<p class="mini">Użyj, jeśli utknąłeś. Na prawdziwym egzaminie tej możliwości nie ma — ' +
      "pominięte elementy kosztują punkty.</p>";
  }

  karta.innerHTML = html;

  var dalej = document.getElementById("btn-matura-dalej");
  if (dalej) {
    dalej.onclick = function () {
      dalej.disabled = true;
      wyslijNaMaturze("", 0, true);
    };
  }

  uruchomMinutnik();
}

/* --- Tura --- */

async function wyslijNaMaturze(tekstZMowy, sek, wymusDalej) {
  if (!App.matura) return;

  var pole = document.getElementById("czat-pole");
  var tresc = (tekstZMowy || pole.value || "").trim();
  if (!tresc && !wymusDalej) return;

  Mowa.stop();
  pole.value = "";
  pole.style.height = "auto";

  if (tresc) {
    dodajDymek("ja", tresc);
    App.matura.wypowiedzi++;
  }

  var pisze = document.createElement("div");
  pisze.className = "dymek ai pisze";
  pisze.textContent = "...";
  document.getElementById("czat-lista").appendChild(pisze);
  przewinNaDol();

  document.getElementById("btn-wyslij").disabled = true;

  try {
    var odp = await Api.wyslij("/api/matura/tura", {
      sesjaId: App.matura.sesjaId,
      etap: App.matura.etap,
      wiadomosc: tresc,
      sek: sek || 0,
      wymusDalej: !!wymusDalej,
    });

    pisze.remove();

    var zmianaEtapu = odp.etap && odp.etap !== App.matura.etap;
    App.matura.etap = odp.etap || App.matura.etap;

    dodajDymek("ai", odp.odpowiedz);
    if (zmianaEtapu) rysujKarteMatury();

    if (App.matura.etap === "koniec") {
      // Mikrofon znika razem z egzaminem — przycisk, który nic nie robi,
      // jest gorszy niż brak przycisku
      App.rozmowaTrwa = false;
      document.getElementById("czat-wejscie").hidden = true;
      Mowa.powiedz(odp.odpowiedz);
    } else {
      // Nowe zadanie znaczy nowe polecenie — bez przewinięcia uczeń zostałby
      // na dole rozmowy i nie zobaczyłby, co ma teraz zrobić
      if (zmianaEtapu) {
        document.getElementById("rozmowa-material").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      mowIPodajGlos(odp.odpowiedz);
    }
  } catch (e) {
    pisze.remove();
    toast(e.message, false);
    if (tresc) pole.value = tresc;
  } finally {
    document.getElementById("btn-wyslij").disabled = false;
    var dalej = document.getElementById("btn-matura-dalej");
    if (dalej) dalej.disabled = false;
  }
}

/* --- Zakończenie i ocena --- */

async function zakonczMature() {
  if (!App.matura) return;

  if (!App.matura.wypowiedzi) {
    // Nieocenionego podejścia nie ma po co trzymać w historii
    var id = App.matura.sesjaId;
    App.matura = null;
    App.rozmowaTrwa = false;
    zatrzymajMinutnik();
    Mowa.stop();
    Mowa.cisza();
    Api.usun("/api/matura/" + id).catch(function () {});
    pokazWidok("dzis");
    return;
  }

  App.rozmowaTrwa = false;
  zatrzymajMinutnik();
  Mowa.stop();
  Mowa.cisza();
  ustawPodpowiedz("");
  spinner(true, "Egzaminator ocenia wypowiedź...");

  try {
    var wynik = await Api.wyslij("/api/matura/" + App.matura.sesjaId + "/ocena", {
      czasSek: Math.round((Date.now() - App.matura.start) / 1000),
    });

    if (wynik.stan) App.stan = wynik.stan;
    App.matura = null;
    App.historiaCzatu = [];
    Matura.dane = null;

    odswiezOdznaki();
    pokazWynikMatury(wynik, null);
  } catch (e) {
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

function pasekKryterium(etykieta, dane, przypis) {
  if (!dane) return "";
  var procent = dane.maks ? Math.round((dane.punkty / dane.maks) * 100) : 0;
  return '<div class="kryterium"><span>' + esc(etykieta) +
    (dane.szacunkowe ? ' <em class="szacunek">szacunkowo</em>' : "") +
    "</span><b>" + dane.punkty + "/" + dane.maks + "</b></div>" +
    '<div class="pasek maly"><div style="width:' + procent + '%"></div></div>' +
    (dane.uzasadnienie ? '<p class="mini">' + esc(dane.uzasadnienie) + "</p>" : "") +
    (przypis ? '<p class="mini przypis">' + esc(przypis) + "</p>" : "");
}

function pokazWynikMatury(wynik, archiwalne) {
  var o = wynik.ocena || {};

  document.getElementById("czat-lista").innerHTML = "";
  document.getElementById("czat-wejscie").hidden = true;
  document.getElementById("btn-zakoncz-gora").hidden = true;
  document.getElementById("odznaki").hidden = false;
  document.getElementById("rozmowa-tresc").hidden = true;
  document.getElementById("rozmowa-brak").hidden = true;

  var zdany = !!o.zdany;
  var html =
    '<div class="srodek" style="font-size:40px">' + (zdany ? "🎓" : "📋") + "</div>" +
    '<h2 class="srodek" style="font-size:26px">' + (o.razem || 0) + " / " + (o.maks || 30) + " pkt</h2>" +
    '<p class="srodek"><span class="tag ' + (zdany ? "mocny" : "slaby") + '">' +
    (o.procent || 0) + "% · " + (zdany ? "zdane" : "poniżej progu 30%") + "</span></p>" +
    (archiwalne
      ? '<p class="mini srodek" style="margin-top:6px">' + esc(archiwalne.trybNazwa || "") + " · " +
        esc(String(archiwalne.data || "").slice(0, 16)) + "</p>"
      : '<p class="podpis srodek" style="margin-top:6px">+' + (wynik.xp || 0) + " XP</p>") +
    (o.komentarz ? '<p style="margin-top:12px">' + esc(o.komentarz) + "</p>" : "");

  /* --- Punktacja --- */

  html += '<h3 style="margin-top:16px">Punktacja według kryteriów</h3>';
  (o.sprawnosc || []).forEach(function (s) {
    html += pasekKryterium("Sprawność komunikacyjna — zadanie " + s.zadanie, s);
  });
  html += pasekKryterium("Zakres struktur leksykalno-gramatycznych", o.zakres);
  html += pasekKryterium("Poprawność struktur leksykalno-gramatycznych", o.poprawnosc);
  html += pasekKryterium(
    "Wymowa",
    o.wymowa,
    "Aplikacja nie słyszy nagrania — ocenia po tym, jak wiernie mikrofon zapisał Twoje słowa. " +
      "Tego kryterium nie traktuj jako pewnego."
  );
  html += pasekKryterium(
    "Płynność wypowiedzi",
    o.plynnosc,
    o.tempo ? "Twoje tempo: około " + o.tempo.naMinute + " słów na minutę." : ""
  );

  /* --- Błędy --- */

  html += (o.bledy || []).length
    ? '<h3 style="margin-top:16px">Błędy do poprawienia (' + o.bledy.length + ")</h3>" +
      o.bledy.map(function (b) {
        return '<div class="blad">' +
          (b.bylo ? '<div class="bylo">' + esc(b.bylo) + "</div>" : "") +
          '<div class="powinno">' + esc(b.powinno || "") +
          ' <button class="glosnik" data-mow="' + esc(b.powinno || "") + '">🔊</button></div>' +
          (b.dlaczego ? '<div class="czemu">' + esc(b.dlaczego) + "</div>" : "") +
          "</div>";
      }).join("")
    : '<p class="podpis" style="margin-top:14px">✓ Bez istotnych błędów językowych.</p>';

  /* --- Zwroty --- */

  if ((o.zwroty || []).length) {
    html += '<h3 style="margin-top:16px">Zwroty, których Ci zabrakło</h3>' +
      '<p class="mini">Trafiły już do powtórek w zakładce Słówka.</p>' +
      o.zwroty.map(function (z) {
        return '<div class="pozycja"><div class="tresc"><b>' + esc(z.en) + "</b><small>" +
          esc(z.pl) + (z.kiedy ? " · " + esc(z.kiedy) : "") + "</small></div>" +
          '<button class="btn maly drugi" data-mow="' + esc(z.en) + '">🔊</button></div>';
      }).join("");
  }

  if ((o.mocne || []).length) {
    html += '<h3 style="margin-top:14px">Poszło dobrze</h3><div class="tagi">' +
      o.mocne.map(function (m) { return '<span class="tag mocny">' + esc(m) + "</span>"; }).join("") + "</div>";
  }
  if ((o.doPoprawy || []).length) {
    html += '<h3 style="margin-top:14px">Do pracy przed egzaminem</h3><div class="tagi">' +
      o.doPoprawy.map(function (m) { return '<span class="tag slaby">' + esc(m) + "</span>"; }).join("") + "</div>";
  }

  html += '<button class="btn" id="btn-wroc-matura" style="margin-top:16px">Gotowe</button>';

  var widok = document.getElementById("w-rozmowa");
  var stare = document.getElementById("blok-podsumowania");
  if (stare) stare.remove();

  var blok = document.createElement("div");
  blok.className = "karta akcent";
  blok.id = "blok-podsumowania";
  blok.innerHTML = html;
  widok.insertBefore(blok, widok.firstChild);

  blok.querySelectorAll("[data-mow]").forEach(function (b) {
    b.onclick = function () { Mowa.powiedz(b.dataset.mow); };
  });

  document.getElementById("btn-wroc-matura").onclick = function () {
    blok.remove();
    document.getElementById("rozmowa-brak").hidden = false;
    pokazWidok("dzis");
  };

  window.scrollTo(0, 0);
}

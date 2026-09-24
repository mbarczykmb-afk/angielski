/* ============================================================
   Słówka — fiszki z powtórkami w systemie Leitnera
   ============================================================ */

var Slowa = {
  kolejka: [],
  indeks: 0,
  odkryta: false,
};

function rysujSlowa() {
  var widok = document.getElementById("w-slowa");
  if (!App.stan) return;

  var doPowtorki = App.stan.slowka.filter(function (s) { return s.doPowtorki; });
  var html = "";

  if (Slowa.kolejka.length) {
    widok.innerHTML = rysujFiszke();
    podepnijFiszke();
    return;
  }

  if (doPowtorki.length) {
    html += '<div class="karta akcent srodek">' +
      "<h2>" + doPowtorki.length + " " + odmianaSlowek(doPowtorki.length) + " na dziś</h2>" +
      '<p class="podpis">Odsłuchaj, przypomnij sobie znaczenie, oceń się szczerze.</p>' +
      '<button class="btn" id="btn-start-powtorki" style="margin-top:10px">' + ik("graj") + "Zacznij powtórkę</button></div>";
  } else {
    html += '<div class="karta srodek"><h2>' + ik("ok") + " Powtórki na dziś zrobione</h2>" +
      '<p class="podpis">Kolejne słówka wrócą, gdy przyjdzie ich termin.</p></div>';
  }

  /* --- Dodawanie ręczne --- */

  html += '<div class="karta"><h3>Dodaj słówko</h3>' +
    '<input id="pole-nowe-slowo" type="text" placeholder="np. to look forward to" autocomplete="off">' +
    '<div class="rzad" style="margin-top:8px">' +
    '<button class="btn drugi" id="btn-wyjasnij">' + ik("iskry") + "Uzupełnij AI</button>" +
    '<button class="btn" id="btn-dodaj-slowo">Dodaj</button></div>' +
    '<div id="podglad-slowa" class="mini" style="margin-top:8px"></div></div>';

  /* --- Cała lista --- */

  if (App.stan.slowka.length) {
    var posortowane = App.stan.slowka.slice().sort(function (a, b) {
      return a.nastepnaPowtorka.localeCompare(b.nastepnaPowtorka);
    });

    html += '<div class="karta"><h3>Wszystkie słówka (' + App.stan.slowka.length + ")</h3>" +
      posortowane.map(function (s) {
        return '<div class="pozycja">' +
          '<div class="tresc"><b>' + esc(s.en) + "</b><small>" + esc(s.pl) +
          " · poziom " + s.pudelko + "/6 · " + (s.doPowtorki ? "do powtórki" : "wraca " + dataLudzka(s.nastepnaPowtorka, App.stan.dzis)) +
          "</small></div>" +
          '<button class="btn-cichy" data-mow="' + esc(s.en) + '" aria-label="Posłuchaj">' + ik("glosnik") + "</button>" +
          '<button class="btn-cichy usun" data-usun="' + esc(s.id) + '" aria-label="Usuń słówko">' + ik("kosz") + "</button>" +
          "</div>";
      }).join("") + "</div>";
  }

  widok.innerHTML = html;
  podepnijSlowa();
}

function podepnijSlowa() {
  var start = document.getElementById("btn-start-powtorki");
  if (start) {
    start.onclick = function () {
      Slowa.kolejka = App.stan.slowka.filter(function (s) { return s.doPowtorki; });
      Slowa.indeks = 0;
      Slowa.odkryta = false;
      rysujSlowa();
    };
  }

  var dodaj = document.getElementById("btn-dodaj-slowo");
  if (dodaj) {
    dodaj.onclick = async function () {
      var pole = document.getElementById("pole-nowe-slowo");
      var en = pole.value.trim();
      if (!en) return;

      spinner(true, "Dodaję...");
      try {
        await Api.wyslij("/api/slowka", {
          en: en,
          pl: Slowa._pl || "",
          przyklad: Slowa._przyklad || "",
        });
        Slowa._pl = "";
        Slowa._przyklad = "";
        pole.value = "";
        await odswiezStan();
        rysujSlowa();
        toast("Dodano ✓");
      } catch (e) {
        toast(e.message, false);
      } finally {
        spinner(false);
      }
    };
  }

  var wyjasnij = document.getElementById("btn-wyjasnij");
  if (wyjasnij) {
    wyjasnij.onclick = async function () {
      var en = document.getElementById("pole-nowe-slowo").value.trim();
      if (!en) {
        toast("Najpierw wpisz słowo.", false);
        return;
      }

      spinner(true, "Pytam lektora...");
      try {
        var odp = await Api.wyslij("/api/slowka/wyjasnij", { en: en });
        Slowa._pl = odp.pl;
        Slowa._przyklad = odp.przyklad;
        document.getElementById("podglad-slowa").innerHTML =
          "<b>" + esc(odp.pl) + "</b><br><i>" + esc(odp.przyklad) + "</i>";
      } catch (e) {
        toast(e.message, false);
      } finally {
        spinner(false);
      }
    };
  }

  document.getElementById("w-slowa").querySelectorAll("[data-mow]").forEach(function (b) {
    b.onclick = function () { Mowa.powiedz(b.dataset.mow); };
  });

  document.getElementById("w-slowa").querySelectorAll("[data-usun]").forEach(function (b) {
    b.onclick = async function () {
      if (!confirm("Usunąć to słówko?")) return;
      try {
        await Api.usun("/api/slowka/" + b.dataset.usun);
        await odswiezStan();
        rysujSlowa();
      } catch (e) {
        toast(e.message, false);
      }
    };
  });
}

function rysujFiszke() {
  var s = Slowa.kolejka[Slowa.indeks];
  if (!s) return "";

  return '<p class="mini srodek">' + (Slowa.indeks + 1) + " / " + Slowa.kolejka.length + "</p>" +
    '<div class="pasek"><div style="width:' + Math.round((Slowa.indeks / Slowa.kolejka.length) * 100) + '%"></div></div>' +

    '<div class="fiszka" id="fiszka">' +
    '<div class="slowo">' + esc(s.en) + "</div>" +
    (Slowa.odkryta
      ? '<div class="tlumaczenie">' + esc(s.pl) + "</div>" +
        (s.przyklad ? '<div class="przyklad">' + esc(s.przyklad) + "</div>" : "")
      : '<div class="podpis">dotknij, żeby sprawdzić</div>') +
    "</div>" +

    '<button class="btn drugi" id="btn-mow-fiszke" style="margin-top:12px">' + ik("glosnik") + "Posłuchaj</button>" +

    (Slowa.odkryta
      ? '<div class="oceny">' +
        '<button class="btn czerwony" id="btn-nie-umiem">' + ik("zamknij") + "Nie pamiętam</button>" +
        '<button class="btn" id="btn-umiem">' + ik("ok") + "Umiem</button></div>"
      : "") +

    '<button class="btn drugi" id="btn-przerwij-powtorke" style="margin-top:12px">Przerwij</button>';
}

function podepnijFiszke() {
  var s = Slowa.kolejka[Slowa.indeks];

  document.getElementById("fiszka").onclick = function () {
    if (!Slowa.odkryta) {
      Slowa.odkryta = true;
      rysujSlowa();
    }
  };

  document.getElementById("btn-mow-fiszke").onclick = function (e) {
    e.stopPropagation();
    Mowa.powiedz(s.przyklad || s.en);
  };

  document.getElementById("btn-przerwij-powtorke").onclick = function () {
    Slowa.kolejka = [];
    Slowa.indeks = 0;
    Slowa.odkryta = false;
    rysujSlowa();
  };

  ["umiem", "nie-umiem"].forEach(function (wariant) {
    var el = document.getElementById("btn-" + wariant);
    if (!el) return;
    el.onclick = function () { ocenFiszke(wariant === "umiem"); };
  });

  // Pierwsze pokazanie karty od razu ją czyta — słuch ważniejszy niż pisownia
  if (!Slowa.odkryta) Mowa.powiedz(s.en);
}

async function ocenFiszke(umiem) {
  var s = Slowa.kolejka[Slowa.indeks];

  try {
    await Api.wyslij("/api/slowka/" + s.id + "/powtorka", { umiem: umiem });
  } catch (e) {
    toast(e.message, false);
    return;
  }

  Slowa.indeks++;
  Slowa.odkryta = false;

  if (Slowa.indeks >= Slowa.kolejka.length) {
    var ile = Slowa.kolejka.length;
    Slowa.kolejka = [];
    Slowa.indeks = 0;
    await odswiezStan();
    odswiezOdznaki();
    rysujSlowa();
    toast("Powtórka skończona — " + ile + " " + odmianaSlowek(ile) + " ✓");
  } else {
    rysujSlowa();
  }
}

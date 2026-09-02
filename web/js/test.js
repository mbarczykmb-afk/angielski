/* ============================================================
   Test poziomujący — 12 zadań, ocena CEFR, plan 30 dni
   ============================================================ */

var Test = {
  pytania: [],
  indeks: 0,
  odpowiedzi: [],
  wybrana: null,
};

function podepnijTest() {
  document.getElementById("btn-start-testu").onclick = startTestu;
  document.getElementById("btn-test-dalej").onclick = dalejWTescie;

  document.getElementById("btn-test-mikrofon").onclick = function () {
    var pole = document.getElementById("test-odpowiedz");
    var przycisk = this;
    przycisk.textContent = "🔴 Słucham — dotknij, by zakończyć";

    Mowa.sluchaj(
      function (tekst) { pole.value = tekst; },
      function () { przycisk.textContent = "🎤 Powiedz odpowiedź"; }
    );
  };
}

async function startTestu() {
  spinner(true, "Układam test pod Ciebie...");
  pokazBladTestu("");

  try {
    var odp = await Api.wyslij("/api/test/start", {});
    Test.pytania = odp.pytania || [];
    Test.indeks = 0;
    Test.odpowiedzi = [];

    document.getElementById("test-powitanie").hidden = true;
    document.getElementById("test-wynik").hidden = true;
    pokazPytanie();
  } catch (e) {
    // Błąd zostaje na ekranie — znikający toast nie daje szansy go przeczytać
    // ani przepisać, a to zwykle jedyny trop przy kłopotach z konfiguracją
    pokazBladTestu(e.message);
    toast("Nie udało się rozpocząć testu", false);
  } finally {
    spinner(false);
  }
}

function pokazBladTestu(wiadomosc) {
  var blok = document.getElementById("test-blad");

  if (!wiadomosc) {
    if (blok) blok.remove();
    return;
  }

  if (!blok) {
    blok = document.createElement("div");
    blok.id = "test-blad";
    blok.className = "karta";
    blok.style.borderColor = "var(--czerwony)";
    document.getElementById("test-powitanie").after(blok);
  }

  blok.innerHTML =
    '<h3 style="color:var(--czerwony)">Coś nie zadziałało</h3>' +
    '<p style="word-break:break-word">' + esc(wiadomosc) + "</p>" +
    '<p class="mini" style="margin-top:10px">Skopiuj tę treść, jeśli będziesz szukać przyczyny.</p>';
}

function pokazPytanie() {
  var p = Test.pytania[Test.indeks];
  Test.wybrana = null;

  document.getElementById("test-licznik").textContent = (Test.indeks + 1) + " / " + Test.pytania.length;
  document.getElementById("test-poziom").textContent = p.poziom || "";
  document.getElementById("test-tresc").textContent = p.pytanie || "";
  document.getElementById("test-pytanie").hidden = false;

  var opcje = document.getElementById("test-opcje");
  var otwarte = document.getElementById("test-otwarte");

  if (p.typ === "wybor" && Array.isArray(p.opcje)) {
    otwarte.hidden = true;
    opcje.hidden = false;
    opcje.innerHTML = p.opcje.map(function (o, i) {
      return '<div class="opcja" data-i="' + i + '">' + esc(o) + "</div>";
    }).join("");

    opcje.querySelectorAll(".opcja").forEach(function (el) {
      el.onclick = function () {
        opcje.querySelectorAll(".opcja").forEach(function (x) { x.classList.remove("wybrana"); });
        el.classList.add("wybrana");
        Test.wybrana = Number(el.dataset.i);
      };
    });
  } else {
    opcje.hidden = true;
    opcje.innerHTML = "";
    otwarte.hidden = false;
    document.getElementById("test-odpowiedz").value = "";
  }

  document.getElementById("btn-test-dalej").textContent =
    Test.indeks === Test.pytania.length - 1 ? "Zakończ test" : "Dalej";

  window.scrollTo(0, 0);
}

function dalejWTescie() {
  var p = Test.pytania[Test.indeks];
  var odpowiedz;

  if (p.typ === "wybor") {
    if (Test.wybrana === null) {
      toast("Wybierz odpowiedź.", false);
      return;
    }
    odpowiedz = (p.opcje || [])[Test.wybrana];
  } else {
    odpowiedz = document.getElementById("test-odpowiedz").value.trim();
    if (!odpowiedz) {
      toast("Napisz albo powiedz odpowiedź.", false);
      return;
    }
  }

  Test.odpowiedzi.push({
    id: p.id,
    typ: p.typ,
    poziom: p.poziom,
    pytanie: p.pytanie,
    odpowiedz: odpowiedz,
    // Poprawną wysyłamy razem z odpowiedzią, żeby oceniający model miał klucz
    poprawna: p.typ === "wybor" ? (p.opcje || [])[p.poprawna] : null,
  });

  Mowa.stop();

  if (Test.indeks < Test.pytania.length - 1) {
    Test.indeks++;
    pokazPytanie();
  } else {
    zakonczTest();
  }
}

async function zakonczTest() {
  document.getElementById("test-pytanie").hidden = true;
  spinner(true, "Oceniam odpowiedzi i układam Twój plan na 30 dni. To potrwa kilkadziesiąt sekund.");

  try {
    var wynik = await Api.wyslij("/api/test/ocena", { odpowiedzi: Test.odpowiedzi });
    App.stan = wynik.stan;

    var blok = document.getElementById("test-wynik");
    blok.innerHTML =
      '<h2 style="font-size:26px;text-align:center;margin-bottom:4px">Twój poziom: ' + esc(wynik.poziom) + "</h2>" +
      '<p class="podpis srodek" style="margin-bottom:14px">' + wynik.punkty + " / 100 punktów</p>" +
      (wynik.komentarz ? '<p style="margin-bottom:14px">' + esc(wynik.komentarz) + "</p>" : "") +
      (wynik.mocne.length
        ? '<h3>Mocne strony</h3><div class="tagi">' +
          wynik.mocne.map(function (m) { return '<span class="tag mocny">' + esc(m) + "</span>"; }).join("") +
          "</div>"
        : "") +
      (wynik.slabe.length
        ? '<h3 style="margin-top:14px">Nad czym popracujemy</h3><div class="tagi">' +
          wynik.slabe.map(function (s) { return '<span class="tag slaby">' + esc(s) + "</span>"; }).join("") +
          "</div>"
        : "") +
      '<hr><p class="podpis">Plan na 30 dni jest gotowy. Każdy dzień to jedna rozmowa — wracamy w niej do Twoich słabych stron.</p>' +
      '<button class="btn" id="btn-do-aplikacji" style="margin-top:12px">Przejdź do planu</button>';

    blok.hidden = false;
    document.getElementById("btn-do-aplikacji").onclick = function () {
      pokazEkran("glowny");
      odswiezOdznaki();
      pokazWidok("dzis");
    };
  } catch (e) {
    toast(e.message, false);
    document.getElementById("test-pytanie").hidden = false;
  } finally {
    spinner(false);
  }
}

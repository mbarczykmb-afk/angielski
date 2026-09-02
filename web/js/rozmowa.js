/* ============================================================
   Rozmowa — sedno aplikacji: czat z lektorem AI + mowa
   ============================================================ */

async function otworzLekcje(dzien) {
  spinner(true, "Przygotowuję lekcję...");
  try {
    App.lekcja = await Api.pobierz("/api/lekcja/" + dzien);
    App.historiaCzatu = [];
    App.wypowiedzi = [];
    App.korekty = [];
    App.startLekcji = Date.now();

    pokazWidok("rozmowa");
    rysujRozmowe();

    // Pierwsza kwestia rozmówcy otwiera rozmowę
    if (App.lekcja.pierwszaKwestia) {
      dodajDymek("ai", App.lekcja.pierwszaKwestia);
      App.historiaCzatu.push({ role: "assistant", content: App.lekcja.pierwszaKwestia });
      Mowa.powiedz(App.lekcja.pierwszaKwestia);
    }
  } catch (e) {
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

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
  document.getElementById("rozmowa-material").innerHTML =
    "<h3>Dzień " + l.dzien + "</h3>" +
    '<h2 style="font-size:17px">' + esc(l.temat) + "</h2>" +
    (l.wskazowka ? '<p class="podpis" style="margin-top:6px">💡 ' + esc(l.wskazowka) + "</p>" : "") +

    "<details style='margin-top:10px'><summary>Słownictwo na dziś (" + (l.slownictwo || []).length + ")</summary>" +
    (l.slownictwo || []).map(function (s) {
      return '<div class="pozycja"><div class="tresc"><b>' + esc(s.en) + "</b>" +
        "<small>" + esc(s.pl) + (s.przyklad ? " · " + esc(s.przyklad) : "") + "</small></div>" +
        '<button class="btn maly drugi" data-mow="' + esc(s.en) + '">🔊</button></div>';
    }).join("") + "</details>" +

    ((l.struktury || []).length
      ? "<details><summary>Zwroty do użycia</summary>" +
        (l.struktury || []).map(function (s) {
          return '<div class="pozycja"><div class="tresc"><b>' + esc(s) + "</b></div>" +
            '<button class="btn maly drugi" data-mow="' + esc(s) + '">🔊</button></div>';
        }).join("") + "</details>"
      : "") +

    ((l.pytaniaPomocnicze || []).length
      ? "<details><summary>Utknąłeś? Pytania pomocnicze</summary>" +
        (l.pytaniaPomocnicze || []).map(function (p) {
          return '<p class="podpis" style="padding:5px 0">• ' + esc(p) + "</p>";
        }).join("") + "</details>"
      : "");

  document.getElementById("rozmowa-material").querySelectorAll("[data-mow]").forEach(function (b) {
    b.onclick = function () { Mowa.powiedz(b.dataset.mow); };
  });
}

function dodajDymek(kto, tekst) {
  var lista = document.getElementById("czat-lista");
  var el = document.createElement("div");
  el.className = "dymek " + (kto === "ai" ? "ai" : "ja");
  el.innerHTML = esc(tekst) +
    (kto === "ai" ? ' <button class="glosnik" title="Odsłuchaj">🔊</button>' : "");

  if (kto === "ai") {
    el.querySelector(".glosnik").onclick = function () { Mowa.powiedz(tekst); };
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
    '<div class="powinno">' + esc(korekta.powinno) + "</div>" +
    (korekta.dlaczego ? '<div class="czemu">' + esc(korekta.dlaczego) + "</div>" : "");

  document.getElementById("czat-lista").appendChild(el);
  App.korekty.push(korekta);
  przewinNaDol();
}

function przewinNaDol() {
  requestAnimationFrame(function () {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

async function wyslijWiadomosc() {
  var pole = document.getElementById("czat-pole");
  var tekst = pole.value.trim();
  if (!tekst || !App.lekcja) return;

  Mowa.stop();
  pole.value = "";
  pole.style.height = "auto";

  dodajDymek("ja", tekst);
  App.wypowiedzi.push(tekst);

  var pisze = document.createElement("div");
  pisze.className = "dymek ai pisze";
  pisze.textContent = "pisze...";
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
    Mowa.powiedz(odp.odpowiedz);

    if (odp.korekta) dodajKorekte(odp.korekta);

    // Nowe słowa od rozmówcy od razu trafiają do powtórek
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
    // Wiadomość wraca do pola, żeby nie przepadła
    pole.value = tekst;
  } finally {
    document.getElementById("btn-wyslij").disabled = false;
  }
}

async function zakonczLekcje() {
  if (!App.lekcja) return;

  if (!App.wypowiedzi.length) {
    toast("Powiedz albo napisz coś, zanim zakończysz.", false);
    return;
  }

  Mowa.stop();
  Mowa.cisza();
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
          return '<div class="pozycja"><div class="tresc"><b>' + esc(s.en) + "</b><small>" + esc(s.pl) + "</small></div></div>";
        }).join("")
      : "") +
    '<button class="btn" id="btn-wroc-dzis" style="margin-top:14px">Gotowe</button>';

  var stare = document.getElementById("blok-podsumowania");
  if (stare) stare.remove();
  widok.insertBefore(blok, widok.firstChild);

  document.getElementById("btn-wroc-dzis").onclick = function () {
    blok.remove();
    document.getElementById("rozmowa-brak").hidden = false;
    pokazWidok("dzis");
  };

  window.scrollTo(0, 0);
}

function podepnijRozmowe() {
  var pole = document.getElementById("czat-pole");

  document.getElementById("btn-wyslij").onclick = wyslijWiadomosc;
  document.getElementById("btn-zakoncz-lekcje").onclick = zakonczLekcje;

  // Enter wysyła, Shift+Enter robi nową linię
  pole.onkeydown = function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      wyslijWiadomosc();
    }
  };

  // Pole rośnie razem z tekstem
  pole.oninput = function () {
    pole.style.height = "auto";
    pole.style.height = Math.min(110, pole.scrollHeight) + "px";
  };

  document.getElementById("btn-mikrofon").onclick = function () {
    Mowa.sluchaj(
      function (tekst) {
        pole.value = tekst;
        pole.style.height = "auto";
        pole.style.height = Math.min(110, pole.scrollHeight) + "px";
      },
      function (koncowy) {
        // Rozpoznane zdanie wysyłamy od razu — rozmowa ma płynąć bez dodatkowego dotknięcia
        if (koncowy && koncowy.trim()) wyslijWiadomosc();
      }
    );
  };
}

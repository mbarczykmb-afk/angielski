/* ============================================================
   Widok "Dziś" — lekcja dnia, passa, plan 30 dni
   ============================================================ */

function rysujDzis() {
  var widok = document.getElementById("w-dzis");
  if (!App.stan) {
    widok.innerHTML = '<div class="pusto">Ładuję...</div>';
    return;
  }

  var s = App.stan;
  var dzien = s.plan.find(function (p) { return p.dzien === s.biezacyDzien; });
  var ukonczone = s.plan.filter(function (p) { return p.status === "ukonczony"; }).length;
  var doPowtorki = liczbaDoPowtorki();
  var html = "";

  /* --- Karta lekcji dnia --- */

  if (!dzien) {
    html += '<div class="karta akcent srodek">' +
      "<h2>Brak planu</h2>" +
      '<p class="podpis">Zrób test poziomujący, a ułożę Ci plan 30 dni.</p>' +
      '<button class="btn" onclick="pokazEkran(\'test\')" style="margin-top:10px">Zrób test</button></div>';
  } else if (s.zrobioneDzis && dzien.status === "ukonczony") {
    html += '<div class="karta akcent srodek">' +
      '<div style="font-size:42px">✓</div>' +
      "<h2>Dzisiejsza lekcja zrobiona</h2>" +
      '<p class="podpis">Dobra robota. Jutro dzień ' + (s.biezacyDzien) + ".</p>" +
      (doPowtorki
        ? '<button class="btn" onclick="pokazWidok(\'slowa\')" style="margin-top:10px">Powtórz ' + doPowtorki + " " + odmianaSlowek(doPowtorki) + "</button>"
        : '<button class="btn drugi" id="btn-dodatkowa" style="margin-top:10px">Jeszcze jedna rozmowa</button>') +
      "</div>";
  } else {
    html += '<div class="karta akcent">' +
      '<h3>Dzień ' + dzien.dzien + " z 30</h3>" +
      '<h2 style="font-size:19px;margin-bottom:6px">' + esc(dzien.temat) + "</h2>" +
      '<p class="podpis">' + esc(dzien.cel) + "</p>" +
      '<div class="pasek"><div style="width:' + Math.round((ukonczone / Math.max(1, s.plan.length)) * 100) + '%"></div></div>' +
      '<p class="mini">' + ukonczone + " z " + s.plan.length + " dni za Tobą</p>" +
      '<button class="btn" id="btn-start-lekcji" style="margin-top:12px">▶ Zacznij rozmowę</button>' +
      "</div>";
  }

  /* --- Statystyki --- */

  html += '<div class="karta"><div class="statystyki">' +
    '<div class="statystyka"><b style="color:var(--zolty)">' + s.user.streak + "</b><span>dni z rzędu</span></div>" +
    '<div class="statystyka"><b style="color:var(--zielony2)">' + s.user.xp + "</b><span>XP</span></div>" +
    '<div class="statystyka"><b style="color:var(--niebieski)">' + s.slowka.length + "</b><span>słówek</span></div>" +
    "</div></div>";

  /* --- Powtórki --- */

  if (doPowtorki) {
    html += '<div class="karta" style="border-color:var(--zolty)">' +
      '<h2>📚 ' + doPowtorki + " " + odmianaSlowek(doPowtorki) + " do powtórki</h2>" +
      '<p class="podpis">Krótka runda fiszek utrwali to, czego użyłeś w rozmowach.</p>' +
      '<button class="btn drugi" onclick="pokazWidok(\'slowa\')" style="margin-top:10px">Powtórz teraz</button></div>';
  }

  /* --- Plan --- */

  if (s.plan.length) {
    html += '<div class="karta"><h3>Plan 30 dni</h3><div id="lista-planu">' +
      s.plan.map(function (p) {
        var klasa = p.status === "ukonczony" ? "ukonczony" : (p.dzien === s.biezacyDzien ? "biezacy" : "");
        return '<div class="dzien-planu ' + klasa + '" data-dzien="' + p.dzien + '">' +
          '<div class="numer">' + (p.status === "ukonczony" ? "✓" : p.dzien) + "</div>" +
          '<div class="opis">' + esc(p.temat) + "<small>" + esc(p.cel) + "</small></div></div>";
      }).join("") +
      "</div></div>";
  }

  widok.innerHTML = html;

  /* --- Zdarzenia --- */

  var start = document.getElementById("btn-start-lekcji");
  if (start) start.onclick = function () { otworzLekcje(s.biezacyDzien); };

  var dodatkowa = document.getElementById("btn-dodatkowa");
  if (dodatkowa) dodatkowa.onclick = function () { otworzLekcje(s.biezacyDzien); };

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

function odmianaSlowek(n) {
  if (n === 1) return "słówko";
  var ostatnia = n % 10;
  var przedostatnia = Math.floor(n / 10) % 10;
  if (ostatnia >= 2 && ostatnia <= 4 && przedostatnia !== 1) return "słówka";
  return "słówek";
}

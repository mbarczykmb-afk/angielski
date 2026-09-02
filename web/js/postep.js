/* ============================================================
   Postęp — statystyki, wykres XP, ocena poziomu
   ============================================================ */

function rysujPostep() {
  var widok = document.getElementById("w-postep");
  if (!App.stan) return;

  var s = App.stan;
  var lekcje = s.postep.filter(function (p) { return p.typ === "lekcja"; });
  var sredniaOcena = lekcje.length
    ? Math.round(lekcje.reduce(function (a, p) { return a + p.wynik; }, 0) / lekcje.length)
    : 0;
  var minuty = Math.round(s.postep.reduce(function (a, p) { return a + p.czasSek; }, 0) / 60);
  var ukonczone = s.plan.filter(function (p) { return p.status === "ukonczony"; }).length;

  var html =
    '<div class="karta"><div class="statystyki">' +
    '<div class="statystyka"><b>' + ukonczone + "</b><span>lekcji</span></div>" +
    '<div class="statystyka"><b>' + minuty + "</b><span>minut</span></div>" +
    '<div class="statystyka"><b>' + sredniaOcena + "</b><span>śr. ocena</span></div>" +
    "</div></div>";

  /* --- Wykres XP --- */

  if (lekcje.length >= 2) {
    html += '<div class="karta"><h3>XP w czasie</h3><canvas id="wykres" width="600" height="280"></canvas></div>';
  }

  /* --- Ostatnie 5 tygodni --- */

  html += '<div class="karta"><h3>Ostatnie 5 tygodni</h3>' + rysujKalendarz(s) + "</div>";

  /* --- Ocena poziomu --- */

  if (s.ocena) {
    html += '<div class="karta"><h3>Ocena poziomu</h3>' +
      '<h2 style="font-size:22px">' + esc(s.ocena.poziom) + " · " + s.ocena.punkty + "/100</h2>" +
      '<p class="mini">z dnia ' + esc(s.ocena.data) + "</p>" +
      (s.ocena.komentarz ? '<p style="margin-top:10px">' + esc(s.ocena.komentarz) + "</p>" : "") +
      (s.ocena.mocne.length
        ? '<h3 style="margin-top:12px">Mocne strony</h3><div class="tagi">' +
          s.ocena.mocne.map(function (m) { return '<span class="tag mocny">' + esc(m) + "</span>"; }).join("") + "</div>"
        : "") +
      (s.ocena.slabe.length
        ? '<h3 style="margin-top:12px">Nad czym pracujemy</h3><div class="tagi">' +
          s.ocena.slabe.map(function (m) { return '<span class="tag slaby">' + esc(m) + "</span>"; }).join("") + "</div>"
        : "") +
      '<button class="btn drugi" id="btn-powtorz-test" style="margin-top:14px">Zrób test ponownie</button>' +
      '<p class="mini" style="margin-top:6px">Nowy test ustawi poziom od nowa i ułoży świeży plan 30 dni. Postępy i słówka zostają.</p>' +
      "</div>";
  }

  /* --- Historia lekcji --- */

  if (lekcje.length) {
    html += '<div class="karta"><h3>Historia</h3>' +
      lekcje.slice().reverse().slice(0, 30).map(function (p) {
        var dzien = s.plan.find(function (x) { return x.dzien === p.dzien; });
        return '<div class="pozycja"><div class="tresc"><b>Dzień ' + p.dzien +
          (dzien ? " · " + esc(dzien.temat) : "") + "</b>" +
          "<small>" + esc(p.data) + " · " + p.wynik + "/100 · " + Math.round(p.czasSek / 60) + " min</small></div>" +
          '<span class="odznaka xp">+' + p.xp + "</span></div>";
      }).join("") + "</div>";
  }

  widok.innerHTML = html;

  if (lekcje.length >= 2) rysujWykresXp(lekcje);

  var powtorz = document.getElementById("btn-powtorz-test");
  if (powtorz) {
    powtorz.onclick = function () {
      if (!confirm("Nowy test zastąpi obecny poziom i plan 30 dni. Kontynuować?")) return;
      document.getElementById("test-powitanie").hidden = false;
      document.getElementById("test-pytanie").hidden = true;
      document.getElementById("test-wynik").hidden = true;
      pokazEkran("test");
    };
  }
}

/* --- Kalendarz passy: 5 tygodni wstecz --- */

function rysujKalendarz(s) {
  var dni = {};
  s.postep.forEach(function (p) { dni[p.data] = (dni[p.data] || 0) + p.xp; });

  var dzisiaj = new Date();
  var komorki = [];

  for (var i = 34; i >= 0; i--) {
    var d = new Date(dzisiaj);
    d.setDate(d.getDate() - i);
    var iso = d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");

    var xp = dni[iso] || 0;
    var kolor = xp === 0 ? "var(--tlo3)"
      : xp < 30 ? "rgba(29,158,117,.4)"
      : xp < 60 ? "rgba(29,158,117,.7)"
      : "var(--zielony2)";

    komorki.push('<div title="' + iso + ": " + xp + ' XP" style="aspect-ratio:1;border-radius:4px;background:' + kolor + '"></div>');
  }

  return '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">' + komorki.join("") + "</div>" +
    '<p class="mini" style="margin-top:8px">Każdy kwadrat to jeden dzień. Im jaśniejszy, tym więcej XP.</p>';
}

/* --- Wykres XP (bez bibliotek, żeby działał offline) --- */

function rysujWykresXp(lekcje) {
  var plotno = document.getElementById("wykres");
  if (!plotno) return;

  var ctx = plotno.getContext("2d");
  var szer = plotno.width;
  var wys = plotno.height;
  var margines = { gora: 16, prawo: 12, dol: 34, lewo: 40 };

  // XP narastająco — pokazuje, że postęp się kumuluje
  var suma = 0;
  var punkty = lekcje.map(function (p) {
    suma += p.xp;
    return { data: p.data, wartosc: suma };
  });

  var maks = Math.max.apply(null, punkty.map(function (p) { return p.wartosc; })) || 1;
  var szerWykresu = szer - margines.lewo - margines.prawo;
  var wysWykresu = wys - margines.gora - margines.dol;

  function x(i) {
    return margines.lewo + (punkty.length === 1 ? szerWykresu / 2 : (i / (punkty.length - 1)) * szerWykresu);
  }
  function y(w) {
    return margines.gora + wysWykresu - (w / maks) * wysWykresu;
  }

  ctx.clearRect(0, 0, szer, wys);

  // Siatka i opisy osi
  ctx.strokeStyle = "#21262d";
  ctx.fillStyle = "#8b949e";
  ctx.font = "12px sans-serif";
  ctx.lineWidth = 1;

  for (var i = 0; i <= 4; i++) {
    var wartosc = Math.round((maks / 4) * i);
    var yy = y(wartosc);
    ctx.beginPath();
    ctx.moveTo(margines.lewo, yy);
    ctx.lineTo(szer - margines.prawo, yy);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(String(wartosc), margines.lewo - 6, yy + 4);
  }

  // Wypełnienie pod krzywą
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  punkty.forEach(function (p, i) { ctx.lineTo(x(i), y(p.wartosc)); });
  ctx.lineTo(x(punkty.length - 1), y(0));
  ctx.closePath();
  ctx.fillStyle = "rgba(29,158,117,.18)";
  ctx.fill();

  // Krzywa
  ctx.beginPath();
  punkty.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(x(i), y(p.wartosc));
    else ctx.lineTo(x(i), y(p.wartosc));
  });
  ctx.strokeStyle = "#24c48f";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Punkty
  ctx.fillStyle = "#24c48f";
  punkty.forEach(function (p, i) {
    ctx.beginPath();
    ctx.arc(x(i), y(p.wartosc), 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Daty skrajne
  ctx.fillStyle = "#8b949e";
  ctx.textAlign = "left";
  ctx.fillText(punkty[0].data.slice(5), margines.lewo, wys - 12);
  if (punkty.length > 1) {
    ctx.textAlign = "right";
    ctx.fillText(punkty[punkty.length - 1].data.slice(5), szer - margines.prawo, wys - 12);
  }
}

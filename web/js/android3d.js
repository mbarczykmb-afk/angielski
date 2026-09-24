/* ============================================================
   Android 3D — lektorka Nova i egzaminator Unit X

   Humanoidalna twarz z porcelany, wyrzeźbiona w całości w kodzie:
   z kuli liczymy czaszkę, żuchwę, oczodoły, nos, usta i kości policzkowe
   jako gładkie wzniesienia i wgłębienia. Nie ma tu żadnego pliku modelu
   ani zdjęcia — tylko matematyka, więc nie ma też kłopotu z licencją.

   Mimika to prawdziwe odkształcenia twarzy (morph targets), a nie ikonki:
   szczęka opada przy mówieniu, kąciki ust idą w górę przy uśmiechu,
   brwi unoszą się i marszczą, powieki mrugają i mrużą się, a oczy patrzą.
   Wszystkie odkształcenia liczy ta sama funkcja rzeźby, więc twarz
   w każdej minie zostaje sobą.

   Styl: gładka porcelana, świecące niebieskie tęczówki, odsłonięty bok
   głowy z obwodami i światełkami, ucho jak tarcza z pierścieniami,
   mechaniczna szyja.
   ============================================================ */

var Android3D = {
  _moduly: null,

  dostepny: function () {
    return Robot3D.dostepny();
  },

  _wczytaj: function () {
    if (!this._moduly) {
      var baza = new URL("js/vendor/", document.baseURI).href;
      this._moduly = Promise.all([import(baza + "three.module.min.js"), import(baza + "RoomEnvironment.js")]);
    }
    return this._moduly;
  },

  utworz: async function (kontener, wariant) {
    var moduly = await this._wczytaj();
    return zbudujAndroida(moduly[0], moduly[1].RoomEnvironment, kontener, wariant === "egzaminator");
  },
};

/* --- Proporcje twarzy obu postaci --- */

var TWARZE_ANDROIDA = {
  // Nova: smukła żuchwa, drobny nos, pełniejsze usta, wysokie kości policzkowe
  nova: {
    szer: 0.77, zuchwa: 0.4, nos: 0.85, usta: 1.25, brwi: 0.75, kosci: 1.15, oko: 0.104,
    skora: 0xeef1f5, oczy: 0x4fd8ff, usmiechBazowy: 0.2,
    brew: "#6a7380", wargi: "#d7bfc7", swiatla: "#ffc27a",
  },
  // Unit X: szersza żuchwa, mocniejszy nos i łuk brwiowy, grafitowa porcelana
  unitx: {
    szer: 0.8, zuchwa: 0.26, nos: 1.15, usta: 0.85, brwi: 1.25, kosci: 0.75, oko: 0.094,
    skora: 0xaab3bf, oczy: 0x6cb4ff, usmiechBazowy: 0,
    brew: "#4a525e", wargi: "#98a1ad", swiatla: "#8fc8ff",
  },
};

/* --- Narzędzia rzeźbiarskie --- */

function gaus(u, v, cu, cv, su, sv) {
  var a = (u - cu) / su, b = (v - cv) / sv;
  return Math.exp(-0.5 * (a * a + b * b));
}

// Para symetryczna: to samo wzniesienie po obu stronach twarzy
function gausPara(u, v, cu, cv, su, sv) {
  return gaus(u, v, cu, cv, su, sv) + gaus(u, v, -cu, cv, su, sv);
}

function gladko(a, b, t) {
  t = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

var MINY_ANDROIDA = ["szczeka", "usmiech", "smutek", "dziob", "brwi", "brwiWew", "brewP"];

/**
 * Rzeźba twarzy. Z punktu na kuli jednostkowej (x, y, z) robi punkt głowy.
 * m — wagi min 0..1 (szczęka, uśmiech, ...). Bez min wychodzi twarz spokojna.
 */
// Położenie oczu na kuli. U człowieka rozstaw źrenic to ok. 40% szerokości głowy —
// przy mniejszym twarz wygląda na ściśniętą na środku balonu.
var OKO_X = 0.37;
// Połowa szerokości ust. U człowieka kąciki leżą mniej więcej pod źrenicami —
// wąskie usta na dużej głowie dają buzię lalki, a nie twarz.
var USTA_X = 0.19;

function rzezbaTwarzy(P, x, y, z, m) {
  var u = x, v = y;
  // Rysy twarzy tylko z przodu — z tyłu te same (x, y) to potylica
  var przod = gladko(0.05, 0.5, z);

  // Dolna część twarzy dłuższa niż w kuli: duża czaszka nad małą buzią
  // to proporcje niemowlęcia albo maskotki, a dorosła twarz ma wyraźną żuchwę
  var DOL = 1.1;
  var X = x * P.szer, Y = y * (y > 0 ? 0.93 : DOL), Z = z * 0.92;
  if (z < 0) Z *= 0.98; // potylica bez przesady — inaczej głowa robi się kulą

  // Żuchwa zwęża się ku brodzie; u Novy mocniej niż u Unit X
  if (y < 0) {
    var t = Math.min(1, -y);
    // Mocniej przy brodzie niż przy kościach policzkowych — wyraźna linia żuchwy
    X *= 1 - P.zuchwa * 1.3 * Math.pow(t, 1.7);
    Z *= 1 - (z < 0 ? 0.22 : 0.05) * t * t;
    // Pod brodą płasko — bez tego dół głowy był kulą jak balon
    if (y < -0.62) Y = -0.62 * DOL + (y + 0.62) * 0.55;
  }

  // Rysy jako wzniesienia i wgłębienia w przód
  var dz = 0;
  dz -= 0.16 * gausPara(u, v, OKO_X, 0.12, 0.17, 0.11);           // oczodoły — głębokie, żeby gałka miała miejsce
  dz += 0.035 * P.brwi * gausPara(u, v, OKO_X, 0.28, 0.17, 0.05); // łuk brwiowy
  dz += 0.11 * P.nos * gaus(u, v, 0, 0, 0.05, 0.14);              // grzbiet nosa
  dz += 0.13 * P.nos * gaus(u, v, 0, -0.16, 0.065, 0.05);         // czubek nosa
  dz += 0.035 * gausPara(u, v, 0.065, -0.19, 0.045, 0.03);        // skrzydełka nosa
  dz -= 0.02 * gaus(u, v, 0, -0.31, 0.03, 0.04);                  // rynienka nad wargą
  dz += 0.055 * P.usta * gaus(u, v, 0, -0.375, 0.19, 0.03);       // górna warga
  dz += 0.065 * P.usta * gaus(u, v, 0, -0.46, 0.16, 0.035);       // dolna warga
  dz -= 0.025 * gaus(u, v, 0, -0.415, 0.2, 0.012);                // linia ust
  dz -= 0.02 * gaus(u, v, 0, -0.55, 0.12, 0.03);                  // dołek pod wargą
  dz += 0.08 * gaus(u, v, 0, -0.68, 0.12, 0.07);                  // broda wysunięta do przodu
  dz += 0.05 * P.kosci * gausPara(u, v, 0.5, -0.02, 0.13, 0.09);  // kości policzkowe
  dz -= 0.025 * gausPara(u, v, 0.46, -0.32, 0.12, 0.11);          // policzki pod kośćmi
  Z += dz * przod;

  // Pas między wargami (jeden rząd siatki) w spoczynku jest prawie zamknięty.
  // Przy mówieniu rozciąga się, a namalowane na nim wnętrze ust robi się otworem.
  if (Math.abs(v + 0.415) < 0.012) {
    Y += (-0.415 * DOL - Y) * 0.7 * (1 - gladko(USTA_X - 0.02, USTA_X + 0.06, Math.abs(u))) * przod;
  }

  if (!m) return [X, Y, Z];

  /* Miny: przesunięcia liczone na gotowej twarzy */
  var dx = 0, dy = 0, dzm = 0;

  // Uśmiech: kąciki w górę i na boki, policzki unoszą się
  if (m.usmiech) {
    var kaciki = gausPara(u, v, USTA_X, -0.415, 0.06, 0.05);
    dy += 0.065 * kaciki * m.usmiech;
    dx += (u > 0 ? 1 : -1) * 0.028 * kaciki * m.usmiech;
    dzm -= 0.014 * kaciki * m.usmiech;
    dy += 0.018 * gausPara(u, v, 0.35, -0.15, 0.12, 0.1) * m.usmiech;
  }
  // Smutek: kąciki w dół
  if (m.smutek) dy -= 0.03 * gausPara(u, v, USTA_X, -0.415, 0.06, 0.05) * m.smutek;
  // "O" ze zdziwienia: usta węższe i do przodu
  if (m.dziob) {
    var wargi = gaus(u, v, 0, -0.42, 0.18, 0.07);
    dx -= u * 0.35 * wargi * m.dziob * P.szer;
    dzm += 0.03 * wargi * m.dziob;
  }
  // Brwi w górę (zdziwienie, uwaga)
  if (m.brwi) dy += 0.05 * gausPara(u, v, OKO_X, 0.3, 0.18, 0.07) * m.brwi;
  // Wewnętrzne końce brwi w górę (troska)
  if (m.brwiWew) {
    dy += 0.05 * gausPara(u, v, 0.14, 0.28, 0.08, 0.06) * m.brwiWew;
    dy -= 0.012 * gausPara(u, v, 0.43, 0.26, 0.07, 0.06) * m.brwiWew;
  }
  // Jedna brew w górę (zaciekawienie, namysł)
  if (m.brewP) dy += 0.06 * gaus(u, v, OKO_X, 0.3, 0.18, 0.07) * m.brewP;

  X += dx * przod;
  Y += dy * przod;
  Z += dzm * przod;

  // Szczęka: obrót dolnej części twarzy wokół zawiasu przy uszach
  if (m.szczeka) {
    // Przy ustach granica jest ostra — dokładnie na szparze, żeby dolna warga
    // odjeżdżała cała, a nie rozciągała się jak guma. Dalej od ust skóra
    // przechodzi łagodnie, bo tam nie ma szpary.
    var ostro = -v > 0.415 ? 1 : 0;
    var miekko = gladko(0.38, 0.5, -v);
    var przyUstach = 1 - gladko(USTA_X, USTA_X + 0.1, Math.abs(u));
    var waga = (ostro * przyUstach + miekko * (1 - przyUstach)) *
      (1 - gladko(0.55, 0.85, Math.abs(u))) * gladko(-0.4, 0.1, z);
    // Kąciki ust zostają złączone: dolna warga przy kącikach prawie się nie rusza,
    // więc usta otwierają się w migdał, a nie w prostokątną dziurę
    var kacik = gladko(0.03, USTA_X - 0.005, Math.abs(u)) * (1 - gladko(0.44, 0.6, -v));
    var kat = 0.18 * m.szczeka * waga * (1 - kacik * 0.95);
    if (kat) {
      var py = -0.05, pz = -0.3;
      var yy = Y - py, zz = Z - pz;
      Y = py + yy * Math.cos(kat) - zz * Math.sin(kat);
      Z = pz + yy * Math.sin(kat) + zz * Math.cos(kat);
    }
    // Górna warga lekko w górę, gdy usta się otwierają
    Y += 0.012 * m.szczeka * gaus(u, v, 0, -0.38, 0.1, 0.03) * przod;
  }

  return [X, Y, Z];
}

/* --- Tekstura: porcelana z łączeniami, portami, kratkami i obwodami --- */

// Punkt z przodu kuli (x, y) na teksturze. Kula ma mapowanie równoodległościowe:
// u = kąt wokół osi pionowej, v = kąt od czubka głowy.
function naTeksture(x, y, W, H, tyl) {
  var z = Math.sqrt(Math.max(0, 1 - x * x - y * y)) * (tyl ? -1 : 1);
  var phi = Math.atan2(z, -x);
  if (phi < 0) phi += 2 * Math.PI;
  var theta = Math.acos(Math.max(-1, Math.min(1, y)));
  return [phi / (2 * Math.PI) * W, theta / Math.PI * H];
}

function rysujTeksturyTwarzy(P, strona) {
  var W = 2048, H = 1024;
  var kolor = document.createElement("canvas");
  kolor.width = W; kolor.height = H;
  var swiec = document.createElement("canvas");
  swiec.width = W; swiec.height = H;
  var k = kolor.getContext("2d");
  var s = swiec.getContext("2d");

  k.fillStyle = "#ffffff";
  k.fillRect(0, 0, W, H);
  s.fillStyle = "#000000";
  s.fillRect(0, 0, W, H);

  var jednostka = W / (2 * Math.PI); // ile pikseli na jednostkę kuli z przodu

  function pkt(x, y, tyl) { return naTeksture(x, y, W, H, tyl); }

  function linia(punkty, grubosc, barwa, tyl) {
    k.beginPath();
    punkty.forEach(function (p, i) {
      var q = pkt(p[0], p[1], tyl);
      if (i === 0) k.moveTo(q[0], q[1]); else k.lineTo(q[0], q[1]);
    });
    k.lineWidth = grubosc;
    k.strokeStyle = barwa;
    k.lineJoin = "round";
    k.lineCap = "round";
    k.stroke();
  }

  function krzywa(fn, od, doo, krok, grubosc, barwa) {
    var p = [];
    for (var t = od; t <= doo + 1e-9; t += krok) p.push(fn(t));
    linia(p, grubosc, barwa);
  }

  // Lekki cień w oczodołach — głębia bez dokładania geometrii
  [-1, 1].forEach(function (st) {
    var c = pkt(st * OKO_X, 0.12);
    var g = k.createRadialGradient(c[0], c[1], 5, c[0], c[1], 0.18 * jednostka);
    g.addColorStop(0, "rgba(120,130,145,.35)");
    g.addColorStop(1, "rgba(120,130,145,0)");
    k.fillStyle = g;
    k.fillRect(c[0] - 80, c[1] - 80, 160, 160);
  });

  // Brwi: cienkie, malowane łuki — przesuwają się razem z odkształceniem twarzy
  [-1, 1].forEach(function (st) {
    krzywa(function (t) { return [st * t, 0.285 + 0.07 * Math.sin((t - 0.2) / 0.34 * Math.PI) * 0.4]; },
      0.2, 0.54, 0.02, 11, P.brew);
  });

  // Usta: delikatny odcień warg
  [[-0.375, 0.19, 0.03], [-0.46, 0.16, 0.035]].forEach(function (w) {
    var c = pkt(0, w[0]);
    k.fillStyle = P.wargi;
    k.beginPath();
    k.ellipse(c[0], c[1], w[1] * jednostka * 0.95, w[2] * jednostka * 1.3, 0, 0, Math.PI * 2);
    k.fill();
  });

  // Wnętrze ust na pasie między wargami: u góry jasna krawędź zębów, niżej ciemno.
  // Pas to dokładnie jeden rząd siatki (114°–115° od czubka), więc rozciąga się
  // razem z nim, gdy szczęka opada.
  (function () {
    var gora = 114 / 180 * H, dol = 115 / 180 * H;
    var lewo = pkt(-USTA_X, -0.415)[0], prawo = pkt(USTA_X, -0.415)[0];
    var g = k.createLinearGradient(0, gora, 0, dol);
    g.addColorStop(0, "#dfe3e8");
    g.addColorStop(0.3, "#c9ced6");
    g.addColorStop(0.42, "#2a1a20");
    g.addColorStop(1, "#150c10");
    k.fillStyle = g;
    k.fillRect(Math.min(lewo, prawo), gora - 0.5, Math.abs(prawo - lewo), dol - gora + 1);
  })();

  var ciemna = "#2b313a";

  // Linia łączenia na czole i wzdłuż skroni aż do żuchwy — jak panele obudowy
  krzywa(function (t) { return [t, 0.6 - 0.35 * t * t]; }, -0.72, 0.72, 0.03, 4, ciemna);
  [-1, 1].forEach(function (st) {
    linia([[st * 0.72, 0.42], [st * 0.8, 0.2], [st * 0.74, -0.05], [st * 0.62, -0.3], [st * 0.5, -0.52], [st * 0.3, -0.7]], 4, ciemna);
    // Łączenie pod kością policzkową prowadzące do portu
    linia([[st * 0.34, -0.26], [st * 0.48, -0.24], [st * 0.56, -0.22]], 3, ciemna);
  });

  // Port na policzku: kratka w ciemnym kole z jasnym pierścieniem
  function port(x, y, r, tyl) {
    var c = pkt(x, y, tyl);
    var rp = r * jednostka;
    k.fillStyle = "#1c2129";
    k.beginPath(); k.arc(c[0], c[1], rp, 0, Math.PI * 2); k.fill();
    k.fillStyle = "#6c7684";
    for (var dx = -rp; dx <= rp; dx += 7) {
      for (var dy = -rp; dy <= rp; dy += 7) {
        if (dx * dx + dy * dy < (rp - 5) * (rp - 5)) { k.beginPath(); k.arc(c[0] + dx, c[1] + dy, 1.6, 0, Math.PI * 2); k.fill(); }
      }
    }
    k.lineWidth = 5; k.strokeStyle = "#dfe4ea";
    k.beginPath(); k.arc(c[0], c[1], rp + 4, 0, Math.PI * 2); k.stroke();
    k.lineWidth = 2; k.strokeStyle = ciemna;
    k.beginPath(); k.arc(c[0], c[1], rp + 8, 0, Math.PI * 2); k.stroke();
  }
  port(0.62, -0.24, 0.04);
  port(-0.62, -0.24, 0.04);

  // Małe czujniki: czarne kropki na czole i przy żuchwie
  [[0.0, 0.72], [0.34, 0.66], [-0.34, 0.66], [0.36, -0.55], [-0.36, -0.55]].forEach(function (p) {
    var c = pkt(p[0], p[1]);
    k.fillStyle = "#12161c";
    k.beginPath(); k.arc(c[0], c[1], 7, 0, Math.PI * 2); k.fill();
    k.lineWidth = 2; k.strokeStyle = "#9aa3ae";
    k.beginPath(); k.arc(c[0], c[1], 11, 0, Math.PI * 2); k.stroke();
  });

  // Kratka pod brodą — ciemna siateczka jak na zdjęciach androidów
  (function () {
    var a = pkt(-0.09, -0.86), b = pkt(0.09, -0.95);
    k.fillStyle = "#1a1f26";
    k.beginPath();
    k.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
    k.fill();
    k.strokeStyle = "#57606c"; k.lineWidth = 2;
    for (var x = Math.min(a[0], b[0]); x < Math.max(a[0], b[0]); x += 6) {
      k.beginPath(); k.moveTo(x, Math.min(a[1], b[1])); k.lineTo(x, Math.max(a[1], b[1])); k.stroke();
    }
  })();

  // Perforacja na czubku głowy — owal gęstych otworów
  (function () {
    var c = pkt(0, 0.9);
    for (var dx = -150; dx <= 150; dx += 11) {
      for (var dy = -34; dy <= 34; dy += 11) {
        if ((dx * dx) / (150 * 150) + (dy * dy) / (34 * 34) < 1) {
          k.fillStyle = "#3a414b";
          k.beginPath(); k.arc(c[0] + dx, c[1] + dy - 20, 2.6, 0, Math.PI * 2); k.fill();
        }
      }
    }
  })();

  // Żaluzje na skroniach: równoległe szczeliny
  [-1, 1].forEach(function (st) {
    for (var i = 0; i < 6; i++) {
      linia([[st * 0.55, 0.62 - i * 0.035], [st * 0.7, 0.55 - i * 0.035]], 4, "#3a414b");
    }
  });

  /* Odsłonięty bok głowy — z tej strony, którą widzi kamera.
     Ciemny panel z obwodami i świecącymi punktami (mapa świecenia). */
  (function () {
    var bok = strona; // +1: prawa strona kadru
    var obrys = [];
    for (var t = 0; t <= 1.0001; t += 0.05) {
      // Łuk od skroni, przez tył ucha, do karku
      var kat = -0.35 + t * 2.1;
      obrys.push([bok * (0.78 + 0.2 * Math.cos(kat * 1.1)), 0.55 - t * 1.05]);
    }
    // Panel rysujemy na tylnej-bocznej ćwiartce: od x≈0.7 w głąb głowy
    var srodek = naTeksture(bok * 0.97, 0.05, W, H);
    var rx = 0.42 * jednostka, ry = 0.5 * jednostka;
    // Panel przesunięty ku tyłowi głowy
    var cx = srodek[0] + (bok > 0 ? 1 : -1) * 0.18 * jednostka;
    var cy = srodek[1];

    k.save();
    k.beginPath();
    k.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    k.clip();
    k.fillStyle = "#171b21";
    k.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);

    // Ścieżki obwodów: odcinki pod kątem prostym i 45°, zakończone punktami
    var ziarno = 7;
    function los() { ziarno = (ziarno * 9301 + 49297) % 233280; return ziarno / 233280; }
    k.strokeStyle = "#8a96a6";
    k.lineWidth = 2;
    for (var n = 0; n < 70; n++) {
      var x0 = cx - rx + los() * rx * 2, y0 = cy - ry + los() * ry * 2;
      k.beginPath(); k.moveTo(x0, y0);
      var x1 = x0 + (los() - 0.5) * 90, y1 = y0;
      k.lineTo(x1, y1);
      var x2 = x1 + (los() > 0.5 ? 1 : -1) * 25, y2 = y1 + 25 * (los() > 0.5 ? 1 : -1);
      k.lineTo(x2, y2);
      k.lineTo(x2, y2 + (los() - 0.5) * 70);
      k.stroke();
      k.fillStyle = "#b8c2cf";
      k.beginPath(); k.arc(x0, y0, 2.5, 0, Math.PI * 2); k.fill();
    }
    k.restore();

    // Świecące punkty na obwodach — ciepłe światełka jak w elektronice
    s.save();
    s.beginPath(); s.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); s.clip();
    ziarno = 11;
    for (var i = 0; i < 26; i++) {
      var px = cx - rx + los() * rx * 2, py = cy - ry + los() * ry * 2;
      var g = s.createRadialGradient(px, py, 0, px, py, 14);
      g.addColorStop(0, P.swiatla);
      g.addColorStop(0.35, P.swiatla + "88");
      g.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = g;
      s.fillRect(px - 14, py - 14, 28, 28);
    }
    s.restore();

    // Obrzeże panelu: jasny kant porcelany
    k.lineWidth = 6; k.strokeStyle = "#e9edf2";
    k.beginPath(); k.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); k.stroke();
  })();

  return { kolor: kolor, swiec: swiec };
}

/* --- Budowa sceny --- */

function zbudujAndroida(THREE, RoomEnvironment, kontener, meski) {
  var P = TWARZE_ANDROIDA[meski ? "unitx" : "nova"];
  var STRONA = 1; // kamera patrzy z prawej strony kadru — tam odsłaniamy obwody

  var rozmiar = Math.max(60, kontener.clientWidth || 86);
  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(rozmiar, rozmiar);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  kontener.innerHTML = "";
  kontener.appendChild(renderer.domElement);

  var scena = new THREE.Scene();
  // Otoczenie studyjne: porcelana dostaje prawdziwe odbicia, a nie tylko plamki światła
  var pmrem = new THREE.PMREMGenerator(renderer);
  var otoczenie = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scena.environment = otoczenie;
  scena.environmentIntensity = 0.42;
  pmrem.dispose();

  var kamera = new THREE.PerspectiveCamera(22, 1, 0.1, 50);
  kamera.position.set(0.2, 0.08, 5.6);
  kamera.lookAt(0.05, -0.14, 0);

  // Klucz z lewej-przodu rzeźbi rysy cieniem, chłodna kontra z prawej-tyłu
  // obrysowuje profil — jak w studiu fotograficznym
  var klucz = new THREE.DirectionalLight(0xffffff, 2.6);
  klucz.position.set(-2.5, 2, 3.5);
  scena.add(klucz);
  var kontra = new THREE.DirectionalLight(new THREE.Color(P.oczy), 3.2);
  kontra.position.set(3.5, 1.2, -2.5);
  scena.add(kontra);
  var wypelnienie = new THREE.DirectionalLight(0xbfd4ff, 0.5);
  wypelnienie.position.set(2, -1, 3);
  scena.add(wypelnienie);

  /* --- Tekstury --- */

  var tekstury = rysujTeksturyTwarzy(P, STRONA);
  var mapa = new THREE.CanvasTexture(tekstury.kolor);
  mapa.colorSpace = THREE.SRGBColorSpace;
  mapa.anisotropy = 4;
  var mapaSwiecenia = new THREE.CanvasTexture(tekstury.swiec);
  mapaSwiecenia.colorSpace = THREE.SRGBColorSpace;

  var mSkora = new THREE.MeshPhysicalMaterial({
    color: P.skora, map: mapa, bumpMap: mapa, bumpScale: 1.5,
    emissive: 0xffffff, emissiveMap: mapaSwiecenia, emissiveIntensity: 1.4,
    roughness: 0.26, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.12,
  });

  /* --- Głowa z mimiką --- */

  var geo = new THREE.SphereGeometry(1, 144, 180);
  var poz = geo.attributes.position;
  var ile = poz.count;
  var oryg = new Float32Array(ile * 3);
  for (var i = 0; i < ile; i++) {
    oryg[i * 3] = poz.getX(i); oryg[i * 3 + 1] = poz.getY(i); oryg[i * 3 + 2] = poz.getZ(i);
  }

  function wyrzezb(miny) {
    var wynik = new Float32Array(ile * 3);
    for (var j = 0; j < ile; j++) {
      var p = rzezbaTwarzy(P, oryg[j * 3], oryg[j * 3 + 1], oryg[j * 3 + 2], miny);
      wynik[j * 3] = p[0]; wynik[j * 3 + 1] = p[1]; wynik[j * 3 + 2] = p[2];
    }
    return wynik;
  }

  var baza = wyrzezb(null);
  poz.array.set(baza);
  poz.needsUpdate = true;

  var zostaw = Array.prototype.slice.call(geo.index.array);
  geo.computeVertexNormals();

  // Miny jako cele odkształcenia, z własnymi normalnymi, żeby światło
  // układało się poprawnie na uśmiechu i otwartych ustach
  var normalneBazy = geo.attributes.normal.array.slice();
  geo.morphAttributes.position = [];
  geo.morphAttributes.normal = [];
  geo.morphTargetsRelative = true;

  var pomocnicza = new THREE.BufferGeometry();
  pomocnicza.setIndex(zostaw);

  MINY_ANDROIDA.forEach(function (nazwa) {
    var miny = {};
    miny[nazwa] = 1;
    var cel = wyrzezb(miny);
    var roznica = new Float32Array(ile * 3);
    for (var j = 0; j < ile * 3; j++) roznica[j] = cel[j] - baza[j];

    pomocnicza.setAttribute("position", new THREE.BufferAttribute(cel, 3));
    pomocnicza.computeVertexNormals();
    var n = pomocnicza.attributes.normal.array;
    var roznicaN = new Float32Array(ile * 3);
    for (var q = 0; q < ile * 3; q++) roznicaN[q] = n[q] - normalneBazy[q];

    geo.morphAttributes.position.push(new THREE.BufferAttribute(roznica, 3));
    geo.morphAttributes.normal.push(new THREE.BufferAttribute(roznicaN, 3));
  });
  pomocnicza.dispose();

  var twarz = new THREE.Mesh(geo, mSkora);
  var wplyw = twarz.morphTargetInfluences;
  var numer = {};
  MINY_ANDROIDA.forEach(function (n, j) { numer[n] = j; });

  var glowa = new THREE.Group();
  glowa.add(twarz);
  scena.add(glowa);

  function punktTwarzy(x, y) {
    var z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    return rzezbaTwarzy(P, x, y, z, null);
  }

  /* --- Oczy: gałka, tęczówka z pierścieniem światła, powieki --- */

  var mBialko = new THREE.MeshPhysicalMaterial({ color: 0xe8edf2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  var mTeczowka = new THREE.MeshStandardMaterial({ color: 0x14314a, roughness: 0.35, metalness: 0.3,
    emissive: new THREE.Color(P.oczy), emissiveIntensity: 0.15 });
  var mPierscien = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.oczy), toneMapped: false });
  var mZrenica = new THREE.MeshBasicMaterial({ color: 0x05070a });
  var mBlask = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  var mRzesy = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.5 });

  var PROMIEN_OKA = P.oko;
  var oczy = [-1, 1].map(function (st) {
    var s = punktTwarzy(st * OKO_X, 0.12);
    var gniazdo = new THREE.Group();
    gniazdo.position.set(s[0], s[1], s[2] - PROMIEN_OKA * 0.1);
    glowa.add(gniazdo);

    var galka = new THREE.Group();
    gniazdo.add(galka);
    galka.add(new THREE.Mesh(new THREE.SphereGeometry(PROMIEN_OKA, 32, 24), mBialko));

    var przodOka = PROMIEN_OKA * 0.985;
    var teczowka = new THREE.Mesh(new THREE.CircleGeometry(PROMIEN_OKA * 0.52, 32), mTeczowka);
    teczowka.position.z = przodOka;
    galka.add(teczowka);
    var pierscien = new THREE.Mesh(new THREE.RingGeometry(PROMIEN_OKA * 0.33, PROMIEN_OKA * 0.5, 40), mPierscien);
    pierscien.position.z = przodOka + 0.0005;
    galka.add(pierscien);
    var zrenica = new THREE.Mesh(new THREE.CircleGeometry(PROMIEN_OKA * 0.2, 24), mZrenica);
    zrenica.position.z = przodOka + 0.001;
    galka.add(zrenica);
    var blask = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 12), mBlask);
    blask.position.set(PROMIEN_OKA * 0.15, PROMIEN_OKA * 0.17, przodOka + 0.0015);
    galka.add(blask);

    // Powieki: czasze z porcelany nasunięte na gałkę; obrót to mrugnięcie
    var gorna = new THREE.Mesh(new THREE.SphereGeometry(PROMIEN_OKA * 1.12, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mSkora);
    gniazdo.add(gorna);
    // Krawędź powieki jako ciemna kreska — jak linia rzęs; obraca się razem z powieką
    var kreska = new THREE.Mesh(new THREE.TorusGeometry(PROMIEN_OKA * 1.12, PROMIEN_OKA * (meski ? 0.05 : 0.085), 8, 32, Math.PI), mRzesy);
    kreska.rotation.x = Math.PI / 2;
    gorna.add(kreska);
    var dolna = new THREE.Mesh(new THREE.SphereGeometry(PROMIEN_OKA * 1.1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mSkora);
    gniazdo.add(dolna);

    return { st: st, galka: galka, gorna: gorna, dolna: dolna };
  });

  /* --- Uszy: tarcze z koncentrycznymi pierścieniami --- */

  var mCiemny = new THREE.MeshStandardMaterial({ color: 0x1c2027, metalness: 0.6, roughness: 0.3 });
  var mChrom = new THREE.MeshStandardMaterial({ color: 0xd0d6de, metalness: 1, roughness: 0.18 });
  var mSwiatloUcha = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.oczy), toneMapped: false, transparent: true, opacity: 0.8 });
  var uszy = [];
  [-1, 1].forEach(function (st) {
    var ucho = new THREE.Group();
    ucho.position.set(st * P.szer * 0.99, 0.0, -0.06);
    ucho.rotation.y = st * Math.PI / 2;
    glowa.add(ucho);

    var tarcza = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.06, 48), mCiemny);
    tarcza.rotation.x = Math.PI / 2;
    ucho.add(tarcza);
    [0.17, 0.13, 0.09, 0.05].forEach(function (r, i) {
      var p = new THREE.Mesh(new THREE.TorusGeometry(r, i === 0 ? 0.012 : 0.007, 8, 48), i % 2 ? mSwiatloUcha : mChrom);
      p.position.z = 0.035;
      ucho.add(p);
      if (i % 2) uszy.push(p);
    });
  });

  /* --- Szyja i ramiona (nie ruszają się z głową) --- */

  var szyja = new THREE.Group();
  szyja.position.set(0, -1.12, -0.18);
  scena.add(szyja);
  // Smukła porcelanowa szyja, z tyłu chromowane tłoczyska jak na zdjęciach androidów
  var mSzyja = new THREE.MeshPhysicalMaterial({ color: P.skora, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
  // Szyja z profilu jak u człowieka: najwęższa pod głową, u dołu rozchodzi się
  // w mięśnie karku i obojczyki. Lekko pochylona do przodu — prosty walec
  // wyglądał jak stojak manekina.
  var g = meski ? 1.12 : 1;
  var profil = [[0.62, -0.62], [0.46, -0.5], [0.34, -0.36], [0.27, -0.16], [0.245, 0.1], [0.25, 0.42]]
    .map(function (p) { return new THREE.Vector2(p[0] * g, p[1]); });
  var kark = new THREE.Mesh(new THREE.LatheGeometry(profil, 40), mSzyja);
  kark.scale.z = 0.85;
  szyja.add(kark);
  szyja.rotation.x = 0.14;
  // Z tyłu chromowane tłoczyska — widać je w szczelinie za żuchwą
  for (var t = 0; t < 5; t++) {
    var kat = Math.PI * (0.7 + t * 0.15);
    var tloczysko = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 10), mChrom);
    tloczysko.position.set(Math.sin(kat) * 0.25 * g, 0.08, Math.cos(kat) * 0.21 * g);
    szyja.add(tloczysko);
  }
  // Ciemne łączenie w połowie szyi — jak szew między segmentami obudowy
  var kolnierz = new THREE.Mesh(new THREE.TorusGeometry(0.262 * g, 0.012, 8, 48), mCiemny);
  kolnierz.rotation.x = Math.PI / 2;
  kolnierz.scale.y = 0.85;
  kolnierz.position.y = -0.12;
  szyja.add(kolnierz);

  var ramiona = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mSzyja);
  ramiona.scale.set(1.5, 0.42, 0.62);
  ramiona.position.set(0, -1.95, -0.25);
  scena.add(ramiona);

  /* --- Animacja --- */

  var st = {
    stan: "czeka", emocja: "neutralna", odEmocji: 0,
    glosnosc: 0, celGlosnosci: 0,
    mrugDo: 0, nastepneMrug: 1.2,
    ostatnia: 0, zyje: true, dt: 1 / 30, start: -1,
    rot: { x: 0, y: -0.42, z: 0 }, pozY: 0,
    wzrok: { x: 0, y: 0 },
    powieki: { gora: -1.12, dol: 1.05 },
    miny: {},
  };
  MINY_ANDROIDA.forEach(function (n) { st.miny[n] = 0; });

  // Wygładzanie zależne od czasu, nie od liczby klatek: ta sama płynność
  // na szybkim telefonie i na słabym, który rysuje 10 klatek na sekundę.
  // tempo = jaka część drogi na klatkę przy 30 kl/s.
  function lagodnie(a, b, tempo) {
    return a + (b - a) * (1 - Math.pow(1 - Math.min(tempo, 0.999), st.dt * 30));
  }

  // Docelowe miny dla emocji; egzaminator pokazuje tylko stany, bez emocji
  function celMin() {
    var c = { szczeka: 0, usmiech: P.usmiechBazowy, smutek: 0, dziob: 0, brwi: 0, brwiWew: 0, brewP: 0 };
    var e = meski ? "neutralna" : st.emocja;
    if (e === "radosc") { c.usmiech = 1; c.brwi = 0.25; }
    if (e === "rozbawienie") { c.usmiech = 1; c.szczeka = 0.3; c.brwi = 0.3; }
    if (e === "zaciekawienie") { c.brewP = 0.9; c.usmiech = 0.35; }
    if (e === "zdziwienie") { c.brwi = 1; c.szczeka = 0.35; c.dziob = 0.5; c.usmiech = 0; }
    if (e === "troska") { c.brwiWew = 1; c.smutek = 0.5; c.usmiech = 0; }

    if (st.stan === "slucha") { c.brwi = Math.max(c.brwi, 0.3); }
    if (st.stan === "mysli") { c.brewP = 0.7; c.dziob = 0.25; c.usmiech = 0; }
    if (st.stan === "mowi") { c.szczeka = 0.06 + st.glosnosc * 0.55; }
    return c;
  }

  function klatka(czasMs) {
    if (!st.zyje) return;
    requestAnimationFrame(klatka);
    if (czasMs - st.ostatnia < 32) return; // ok. 30 klatek/s wystarczy twarzy
    // Czas od pojawienia się twarzy — pierwsze mrugnięcie nie może wypaść od razu
    if (st.start < 0) st.start = czasMs;
    st.dt = Math.min(0.25, (czasMs - (st.ostatnia || czasMs - 33)) / 1000);
    st.ostatnia = czasMs;
    if (document.hidden || !kontener.isConnected || kontener.offsetParent === null) return;

    var t = (czasMs - st.start) / 1000;
    var stan = st.stan;
    var e = meski ? "neutralna" : st.emocja;

    /* Mowa: obwiednia głośności, szczęka za nią nadąża */
    if (stan === "mowi") {
      if (Math.random() < 0.3) st.celGlosnosci = Math.random() < 0.2 ? 0.05 : 0.3 + Math.random() * 0.7;
      st.glosnosc = lagodnie(st.glosnosc, st.celGlosnosci, 0.45);
    } else {
      st.glosnosc = lagodnie(st.glosnosc, 0, 0.3);
    }

    var cel = celMin();
    MINY_ANDROIDA.forEach(function (n) {
      var tempo = n === "szczeka" ? 0.5 : 0.12;
      st.miny[n] = lagodnie(st.miny[n], cel[n], tempo);
      wplyw[numer[n]] = st.miny[n];
    });

    /* Głowa: postawa według stanu, płynne przejścia */
    // Poza trzech czwartych, jak na portretach: twarz lekko w bok, widać odsłonięty bok głowy
    var ZWROT = -0.42;
    var r = { x: 0.02, y: ZWROT + Math.sin(t * 0.45) * 0.05, z: 0 };
    if (stan === "slucha") { r.x = 0.08 + Math.sin(t * 2.6) * 0.04; r.z = -0.06; r.y = ZWROT + 0.08; }
    if (stan === "mysli") { r.x = -0.1; r.y = ZWROT - 0.18; r.z = 0.07; }
    if (stan === "mowi") { r.x = Math.sin(t * 2.9) * 0.025; r.y = ZWROT + 0.05 + Math.sin(t * 1.2) * 0.06; }
    if (e === "zaciekawienie") r.z -= 0.1;
    if (e === "troska") r.x += 0.07;
    var wiek = t - st.odEmocji;
    var podskok = (e === "radosc" || e === "rozbawienie") && wiek < 1.2 ? Math.abs(Math.sin(wiek * 8)) * 0.04 * (1 - wiek / 1.2) : 0;

    st.rot.x = lagodnie(st.rot.x, r.x, 0.1);
    st.rot.y = lagodnie(st.rot.y, r.y, 0.1);
    st.rot.z = lagodnie(st.rot.z, r.z, 0.1);
    st.pozY = lagodnie(st.pozY, Math.sin(t * 1.4) * 0.015 + podskok, 0.25);
    glowa.rotation.set(st.rot.x, st.rot.y, st.rot.z);
    glowa.position.y = st.pozY;

    /* Wzrok: w kamerę; przy myśleniu w górę i w bok; drobne ruchy sakkadowe */
    var w = { x: 0.04, y: -st.rot.y * 0.75 };
    if (stan === "mysli") { w.x = -0.28; w.y = -0.1; }
    if (stan === "czeka" && Math.sin(t * 0.7) > 0.93) w.y += 0.12;
    st.wzrok.x = lagodnie(st.wzrok.x, w.x, 0.2);
    st.wzrok.y = lagodnie(st.wzrok.y, w.y, 0.2);

    /* Powieki: mruganie, mrużenie przy uśmiechu, szerzej przy zdziwieniu */
    if (t > st.nastepneMrug) {
      st.mrugDo = t + 0.13;
      st.nastepneMrug = t + 2.2 + Math.random() * 3.8;
    }
    var gora = -1.12, dol = 1.05;
    if (e === "zdziwienie") gora = -1.38;
    if (e === "radosc" || e === "rozbawienie") dol = 0.55;
    if (e === "troska") gora = -0.95;
    if (stan === "mysli") gora = -0.95;
    if (t < st.mrugDo) { gora = 0.12; dol = 0.8; }
    st.powieki.gora = t < st.mrugDo ? gora : lagodnie(st.powieki.gora, gora, 0.45);
    st.powieki.dol = lagodnie(st.powieki.dol, dol, 0.3);

    oczy.forEach(function (o) {
      o.galka.rotation.set(st.wzrok.x, st.wzrok.y, 0);
      o.gorna.rotation.x = st.powieki.gora;
      o.dolna.rotation.x = st.powieki.dol;
    });

    /* Uszy świecą mocniej, gdy android słucha */
    mSwiatloUcha.opacity = stan === "slucha" ? 0.5 + 0.5 * Math.abs(Math.sin(t * 3.5))
      : stan === "mowi" ? 0.4 + st.glosnosc * 0.6 : 0.45;
    // Obwody na boku głowy pulsują, gdy android myśli
    mSkora.emissiveIntensity = stan === "mysli" ? 1.2 + Math.sin(t * 7) * 0.8 : 1.4;

    renderer.render(scena, kamera);
  }

  requestAnimationFrame(klatka);

  return {
    ustawStan: function (stan) { st.stan = stan; },
    ustawEmocje: function (emocja) {
      st.emocja = emocja;
      st.odEmocji = st.start < 0 ? 0 : (performance.now() - st.start) / 1000;
    },
    slowo: function () { st.celGlosnosci = 0.75 + Math.random() * 0.25; },
    zniszcz: function () {
      st.zyje = false;
      scena.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      mapa.dispose(); mapaSwiecenia.dispose(); otoczenie.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

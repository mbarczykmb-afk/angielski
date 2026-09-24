/* ============================================================
   Android 3D — lektorka Nova i egzaminator Unit X

   Porcelanowy android o ludzkiej twarzy. Rysy (nos, usta, oczodoły,
   kości policzkowe, broda) pochodzą z kanonicznego modelu twarzy
   MediaPipe (vendor/twarz-mediapipe.js, licencja Apache 2.0) — to
   uśredniona, prawdziwa ludzka twarz, a nie kula z wypukłościami.
   Czaszka, ucho, szyja i cały „mechaniczny” wystrój są liczone w kodzie.

   Budowa głowy: gęsta kula, której każdy punkt przesuwamy wzdłuż
   promienia — z przodu na powierzchnię twarzy z modelu, dalej na jajowatą
   czaszkę, z łagodnym przejściem między nimi. Oczy to migdałowe otwory
   wycięte w porcelanie (za nimi gałki ze świecącymi tęczówkami), usta —
   szpara między wargami, która rozchyla się, gdy opada szczęka.

   Mimika to odkształcenia siatki (morph targets): szczęka, uśmiech,
   smutek, „dziubek”, brwi. Powieki mrugają, oczy patrzą w kamerę.

   Wystrój jak na zdjęciach porcelanowych androidów: perforowana kratka
   i szczeliny na czaszce, okrągłe porty połączone cienkimi liniami,
   głośnik na policzku, żebrowane brwi, wargi i broda, żebrowana szyja.
   ============================================================ */

var Android3D = {
  _moduly: null,
  _pamiec: {},

  dostepny: function () {
    return Robot3D.dostepny() && typeof TWARZ_MP !== "undefined";
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

/* --- Obie postacie --- */

var TWARZE_ANDROIDA = {
  // Nova: jasna, lśniąca porcelana, turkusowe oczy
  nova: {
    szerTwarzy: 0.97, zwezenie: 0.12, czaszkaX: 7.4,
    skora: 0xf4f6f8, oczy: 0x3fe0ff, usmiechBazowy: 0.15,
    wargi: "#e2e5e9", zebra: "#c3c9d1", ciemny: "#1b1f25",
  },
  // Unit X: grafitowa porcelana, szersza twarz, chłodne niebieskie oczy
  unitx: {
    szerTwarzy: 1.04, zwezenie: 0.03, czaszkaX: 7.9,
    skora: 0xa9b1bc, oczy: 0x6cb4ff, usmiechBazowy: 0,
    wargi: "#9aa3ae", zebra: "#7e8893", ciemny: "#171a1f",
  },
};

/* --- Narzędzia --- */

function gaus(u, v, cu, cv, su, sv) {
  var a = (u - cu) / su, b = (v - cv) / sv;
  return Math.exp(-0.5 * (a * a + b * b));
}

// Para symetryczna: to samo po obu stronach twarzy
function gausPara(u, v, cu, cv, su, sv) {
  return gaus(u, v, cu, cv, su, sv) + gaus(u, v, -cu, cv, su, sv);
}

function gladko(a, b, t) {
  t = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function wWielokacie(x, y, w) {
  var wewn = false;
  for (var i = 0, j = w.length - 1; i < w.length; j = i++) {
    var xi = w[i][0], yi = w[i][1], xj = w[j][0], yj = w[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) wewn = !wewn;
  }
  return wewn;
}

function najblizszyNaObwodzie(x, y, w) {
  var best = null, bd = Infinity;
  for (var i = 0, j = w.length - 1; i < w.length; j = i++) {
    var ax = w[j][0], ay = w[j][1], bx = w[i][0], by = w[i][1];
    var dx = bx - ax, dy = by - ay;
    var t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    var px = ax + dx * t, py = ay + dy * t;
    var d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bd) { bd = d; best = [px, py]; }
  }
  return best;
}

// Szerokość twarzy na danej wysokości: u Novy żuchwa węższa niż w modelu
function skalaX(P, y) {
  return P.szerTwarzy * (1 - P.zwezenie * gladko(-1.5, -8.5, y));
}

var MINY_ANDROIDA = ["szczeka", "usmiech", "smutek", "dziob", "brwi", "brwiWew", "brewP"];

// Środek czaszki (cm, układ modelu MediaPipe: x w bok, y w górę, z do przodu)
var SRODEK_GLOWY = [0, 1.5, -2.8];

/* --- Twarz z modelu MediaPipe jako mapa wysokości ---
   Rzutujemy trójkąty modelu na siatkę co 1 mm (widok z przodu) i dla
   każdego punktu (x, y) zapamiętujemy, jak daleko do przodu wychodzi twarz.
   Lekkie rozmycie wygładza kanty 468-punktowego modelu. */

function przygotujTwarzMP() {
  if (przygotujTwarzMP._gotowe) return przygotujTwarzMP._gotowe;
  var V = TWARZ_MP.v, F = TWARZ_MP.f;
  var x0 = -8.4, y0 = -10.4, krok = 0.1, nx = 169, ny = 193;
  var H = new Float32Array(nx * ny).fill(-1e9);
  var M = new Float32Array(nx * ny);

  for (var t = 0; t < F.length; t += 3) {
    var a = F[t] * 3, b = F[t + 1] * 3, c = F[t + 2] * 3;
    var ax = V[a], ay = V[a + 1], az = V[a + 2];
    var bx = V[b], by = V[b + 1], bz = V[b + 2];
    var cx = V[c], cy = V[c + 1], cz = V[c + 2];
    var det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-9) continue;
    var i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / krok));
    var i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / krok));
    var j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / krok));
    var j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - y0) / krok));
    for (var j = j0; j <= j1; j++) {
      var py = y0 + j * krok;
      for (var i = i0; i <= i1; i++) {
        var px = x0 + i * krok;
        var l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        var l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        var l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        var z = l1 * az + l2 * bz + l3 * cz;
        var k = j * nx + i;
        if (z > H[k]) H[k] = z;
        M[k] = 1;
      }
    }
  }

  // Poza maską dociągamy wartości z sąsiadów — żeby rozmycie przy brzegu nie zwariowało
  for (var przebieg = 0; przebieg < 14; przebieg++) {
    var nowe = H.slice();
    for (var j2 = 0; j2 < ny; j2++) {
      for (var i2 = 0; i2 < nx; i2++) {
        var k2 = j2 * nx + i2;
        if (H[k2] > -1e8) continue;
        var s = 0, n = 0;
        if (i2 > 0 && H[k2 - 1] > -1e8) { s += H[k2 - 1]; n++; }
        if (i2 < nx - 1 && H[k2 + 1] > -1e8) { s += H[k2 + 1]; n++; }
        if (j2 > 0 && H[k2 - nx] > -1e8) { s += H[k2 - nx]; n++; }
        if (j2 < ny - 1 && H[k2 + nx] > -1e8) { s += H[k2 + nx]; n++; }
        if (n) nowe[k2] = s / n;
      }
    }
    H = nowe;
  }
  for (var k3 = 0; k3 < H.length; k3++) if (H[k3] < -1e8) H[k3] = -6;

  function rozmyj(tab, sigma) {
    var r = Math.ceil(sigma * 3), jadro = [], suma = 0;
    for (var q = -r; q <= r; q++) { var wq = Math.exp(-0.5 * q * q / (sigma * sigma)); jadro.push(wq); suma += wq; }
    jadro = jadro.map(function (x) { return x / suma; });
    var tmp = new Float32Array(tab.length), wyn = new Float32Array(tab.length);
    for (var jj = 0; jj < ny; jj++) for (var ii = 0; ii < nx; ii++) {
      var acc = 0;
      for (var q1 = -r; q1 <= r; q1++) acc += tab[jj * nx + Math.min(nx - 1, Math.max(0, ii + q1))] * jadro[q1 + r];
      tmp[jj * nx + ii] = acc;
    }
    for (var jj2 = 0; jj2 < ny; jj2++) for (var ii2 = 0; ii2 < nx; ii2++) {
      var acc2 = 0;
      for (var q2 = -r; q2 <= r; q2++) acc2 += tmp[Math.min(ny - 1, Math.max(0, jj2 + q2)) * nx + ii2] * jadro[q2 + r];
      wyn[jj2 * nx + ii2] = acc2;
    }
    return wyn;
  }

  var Hg = rozmyj(H, 2.2);
  var Mg = rozmyj(M, 7);

  function probka(tab, x, y) {
    var fx = (x - x0) / krok, fy = (y - y0) / krok;
    if (fx < 0 || fy < 0 || fx > nx - 1.001 || fy > ny - 1.001) return null;
    var i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * nx + i;
    return tab[k] * (1 - u) * (1 - v) + tab[k + 1] * u * (1 - v) + tab[k + nx] * (1 - u) * v + tab[k + nx + 1] * u * v;
  }

  function pkt(i) { return [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]]; }
  function obwod(lista) { return lista.map(function (i) { return pkt(i); }); }

  // Linia ust: środek między wewnętrznymi krawędziami warg
  var gornaWew = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308].map(pkt);
  var dolnaWew = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308].map(pkt);
  var liniaUst = gornaWew.map(function (g, i) { return [(g[0] + dolnaWew[i][0]) / 2, (g[1] + dolnaWew[i][1]) / 2]; });
  var polowa = liniaUst.filter(function (p) { return p[0] >= 0; }).sort(function (p, q) { return p[0] - q[0]; });

  przygotujTwarzMP._gotowe = {
    // Wysokość twarzy w punkcie (x, y) albo null poza siatką
    wys: function (x, y) { return probka(Hg, x, y); },
    // 1 głęboko w twarzy, 0 przy brzegu maski i poza nią
    waga: function (x, y) { var m = probka(Mg, x, y); return m === null ? 0 : gladko(0.55, 0.97, m); },
    wMasce: function (x, y) { var m = probka(M, x, y); return m !== null && m > 0.5; },
    pkt: pkt,
    okoP: obwod([33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]),
    okoL: obwod([263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]),
    wargi: obwod([61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]),
    brewP: obwod([70, 63, 105, 66, 107, 55, 65, 52, 53, 46]),
    brewL: obwod([300, 293, 334, 296, 336, 285, 295, 282, 283, 276]),
    liniaUst: liniaUst,
    kacikWew: Math.abs(pkt(308)[0]),
    // y linii ust dla danego x (w granicach ust)
    yUst: function (x) {
      var ax2 = Math.abs(x);
      if (ax2 <= polowa[0][0]) return polowa[0][1];
      for (var i = 1; i < polowa.length; i++) {
        if (ax2 <= polowa[i][0]) {
          var t2 = (ax2 - polowa[i - 1][0]) / (polowa[i][0] - polowa[i - 1][0]);
          return polowa[i - 1][1] + (polowa[i][1] - polowa[i - 1][1]) * t2;
        }
      }
      return polowa[polowa.length - 1][1];
    },
  };
  return przygotujTwarzMP._gotowe;
}

/* --- Kształt głowy --- */

// Czaszka jak jajo: osobne półosie w każdą stronę, do tego żuchwa z przodu u dołu
function promienCzaszki(P, dx, dy, dz) {
  var a = P.czaszkaX, b = dy > 0 ? 10.6 : 9.8, c = dz > 0 ? 9.2 : 10.6;
  var r = 1 / Math.sqrt((dx / a) * (dx / a) + (dy / b) * (dy / b) + (dz / c) * (dz / c));
  if (dy < 0 && dz > 0) r += 10 * dy * dy * Math.pow(dz, 1.2);
  return r;
}

// Punkt powierzchni głowy w kierunku d od środka czaszki; zwraca też wagę twarzy
function punktGlowy(P, T, dx, dy, dz) {
  var O = SRODEK_GLOWY;
  var rc = promienCzaszki(P, dx, dy, dz);
  if (dz < 0.02) return { r: rc, w: 0 };
  // Szukamy pierwszego przecięcia promienia z powierzchnią twarzy
  function f(t) {
    var px = O[0] + t * dx, py = O[1] + t * dy, pz = O[2] + t * dz;
    var sx = skalaX(P, py);
    if (!T.wMasce(px / sx, py)) return 1;
    return pz - T.wys(px / sx, py);
  }
  var t0 = 2, trafienie = -1;
  if (f(t0) > 0) return { r: rc, w: 0 };
  for (var t = t0 + 0.3; t < 20; t += 0.3) {
    if (f(t) >= 0) {
      var lo = t - 0.3, hi = t;
      for (var k = 0; k < 14; k++) { var mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
      trafienie = (lo + hi) / 2;
      break;
    }
  }
  if (trafienie < 0) return { r: rc, w: 0 };
  var hx = O[0] + trafienie * dx, hy = O[1] + trafienie * dy;
  var w = T.waga(hx / skalaX(P, hy), hy) * gladko(0.02, 0.3, dz);
  return { r: rc + (trafienie - rc) * w, w: w };
}

/* --- Mimika: przesunięcie punktu twarzy dla jednej miny ---
   p — punkt bazowy [x, y, z] w cm; wT — waga twarzy tego punktu;
   podUstami — 1, gdy punkt leży pod szparą ust (w jej szerokości). */

function mina(P, T, nazwa, p, wT, podUstami) {
  var x = p[0], y = p[1], z = p[2];
  var dx = 0, dy = 0, dz = 0;
  var sx = x / skalaX(P, y);
  var yU = T.yUst(sx), xk = T.kacikWew;

  if (nazwa === "szczeka") {
    // Obrót dolnej części twarzy wokół zawiasu przed uchem
    var wUstach = 1 - gladko(xk - 0.15, xk + 0.6, Math.abs(sx));
    var ponizej = yU - y;
    var miekko = gladko(-0.2, 2.4, ponizej);
    var waga = (wUstach * podUstami + (1 - wUstach) * miekko) * gladko(-5, -1.5, z) * gladko(-1, 0.5, ponizej + 0.8);
    // Kąciki zostają złączone — usta otwierają się w migdał
    var kacik = gladko(0.25, xk, Math.abs(sx)) * (1 - gladko(0.4, 2.0, ponizej));
    var kat = 0.16 * waga * (1 - kacik * 0.9);
    var pyy = 0.3, pzz = -3.2;
    var yy = y - pyy, zz = z - pzz;
    var ny = pyy + yy * Math.cos(kat) - zz * Math.sin(kat);
    var nz = pzz + yy * Math.sin(kat) + zz * Math.cos(kat);
    dy = ny - y; dz = nz - z;
    // Górna warga odrobinę w górę
    if (!podUstami) dy += 0.12 * gaus(sx, y, 0, yU + 0.3, 1.6, 0.35) * wT;
    return [dx, dy, dz];
  }

  if (nazwa === "usmiech") {
    var kac = gausPara(sx, y, 2.46, -4.34, 0.85, 0.7);
    dy += 0.55 * kac; dx += (x > 0 ? 1 : -1) * 0.28 * kac; dz -= 0.18 * kac;
    var pol = gausPara(sx, y, 3.3, -1.9, 1.4, 1.2);
    dy += 0.25 * pol; dz += 0.12 * pol;
  } else if (nazwa === "smutek") {
    dy -= 0.35 * gausPara(sx, y, 2.46, -4.34, 0.85, 0.7);
  } else if (nazwa === "dziob") {
    var g = gaus(sx, y, 0, yU, 2.4, 1.1);
    dx -= x * 0.3 * g; dz += 0.4 * g;
  } else if (nazwa === "brwi") {
    dy += 0.5 * gausPara(sx, y, 3.2, 5.0, 2.0, 0.95);
  } else if (nazwa === "brwiWew") {
    dy += 0.45 * gausPara(sx, y, 1.4, 4.8, 0.9, 0.8);
    dy -= 0.12 * gausPara(sx, y, 4.8, 4.4, 1.0, 0.8);
  } else if (nazwa === "brewP") {
    dy += 0.55 * gaus(sx, y, 3.2, 5.0, 2.0, 0.95);
  }
  return [dx * wT, dy * wT, dz * wT];
}

/* --- Tekstura: porcelana, porty, linie, kratki, żebrowania --- */

function rysujTeksture(P, T, promienW) {
  var W = 2048, H = 1024;
  var plotno = document.createElement("canvas");
  plotno.width = W; plotno.height = H;
  var k = plotno.getContext("2d");
  k.fillStyle = "#ffffff";
  k.fillRect(0, 0, W, H);
  var O = SRODEK_GLOWY, PX = W / (2 * Math.PI);

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function naUV(d) {
    var phi = Math.atan2(-d[0], -d[2]);
    if (phi < 0) phi += 2 * Math.PI;
    var th = Math.acos(Math.max(-1, Math.min(1, d[1])));
    return [phi / (2 * Math.PI) * W, th / Math.PI * H, th];
  }
  // Kierunek do punktu twarzy (x, y) z modelu
  function zTwarzy(x, y) {
    var z = T.wys(x, y);
    return norm([x * skalaX(P, y) - O[0], y - O[1], (z === null ? 0 : z) - O[2]]);
  }
  // Kierunek z kątów: odchylenie w bok (w stronę +x) i wysokość, w stopniach
  function zKatow(bok, gora) {
    var b = bok * Math.PI / 180, g = gora * Math.PI / 180;
    return [Math.sin(b) * Math.cos(g), Math.sin(g), Math.cos(b) * Math.cos(g)];
  }

  function linia(kierunki, grubosc, barwa) {
    k.beginPath();
    var poprz = null;
    for (var i = 0; i < kierunki.length - 1; i++) {
      for (var s = 0; s <= 12; s++) {
        var a = kierunki[i], b = kierunki[i + 1], t = s / 12;
        var q = naUV(norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
        if (!poprz || Math.abs(q[0] - poprz[0]) > W / 2) k.moveTo(q[0], q[1]); else k.lineTo(q[0], q[1]);
        poprz = q;
      }
    }
    k.lineWidth = grubosc; k.strokeStyle = barwa; k.lineJoin = "round"; k.lineCap = "round";
    k.stroke();
  }

  function wielokat(kierunki) {
    k.beginPath();
    kierunki.forEach(function (d, i) { var q = naUV(d); if (i === 0) k.moveTo(q[0], q[1]); else k.lineTo(q[0], q[1]); });
    k.closePath();
  }

  // Rysuje w lokalnym układzie punktu d: 1 jednostka = 1 cm na powierzchni
  function wPunkcie(d, rysuj) {
    var q = naUV(d);
    var skala = PX / promienW(d);
    k.save();
    k.translate(q[0], q[1]);
    k.scale(skala / Math.max(0.2, Math.sin(q[2])), skala);
    rysuj(k);
    k.restore();
  }

  // Port „zębatka”: jasny krążek z ząbkami wokół i ciemnym środkiem
  function port(d, r) {
    wPunkcie(d, function (c) {
      c.fillStyle = "#e9ecef"; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
      c.lineWidth = 0.07; c.strokeStyle = "#7a838e";
      c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
      for (var i = 0; i < 28; i++) {
        var a = i / 28 * Math.PI * 2;
        c.beginPath(); c.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        c.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93); c.lineWidth = 0.05; c.stroke();
      }
      c.beginPath(); c.arc(0, 0, r * 0.62, 0, 7); c.lineWidth = 0.06; c.stroke();
      c.fillStyle = P.ciemny; c.beginPath(); c.arc(0, 0, r * 0.28, 0, 7); c.fill();
    });
  }

  // Głośnik: czarna tarcza z siatką otworów w jasnym pierścieniu
  function glosnik(d, r) {
    wPunkcie(d, function (c) {
      c.fillStyle = "#cfd4da"; c.beginPath(); c.arc(0, 0, r * 1.18, 0, 7); c.fill();
      c.fillStyle = P.ciemny; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
      c.fillStyle = "#8c96a1";
      for (var y = -r; y <= r; y += 0.16) for (var x = -r; x <= r; x += 0.16) {
        if (x * x + y * y < (r - 0.12) * (r - 0.12)) { c.beginPath(); c.arc(x, y, 0.045, 0, 7); c.fill(); }
      }
    });
  }

  // Mały czujnik: czarna kropka w jasnej obwódce
  function kropka(d, r) {
    wPunkcie(d, function (c) {
      c.fillStyle = "#d9dde2"; c.beginPath(); c.arc(0, 0, r * 1.6, 0, 7); c.fill();
      c.fillStyle = P.ciemny; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    });
  }

  // Otwór perforacji: sama ciemna kropka
  function otwor(d, r) {
    wPunkcie(d, function (c) {
      c.fillStyle = P.ciemny; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    });
  }

  // Krążek z drobną siatką (pod okiem)
  function krazekSiatki(d, r) {
    wPunkcie(d, function (c) {
      c.save();
      c.beginPath(); c.arc(0, 0, r, 0, 7); c.fillStyle = "#d4d9df"; c.fill(); c.clip();
      c.strokeStyle = "#a3abb5"; c.lineWidth = 0.035;
      for (var x = -r; x <= r; x += 0.12) { c.beginPath(); c.moveTo(x, -r); c.lineTo(x, r); c.stroke(); }
      for (var y = -r; y <= r; y += 0.12) { c.beginPath(); c.moveTo(-r, y); c.lineTo(r, y); c.stroke(); }
      c.restore();
      c.lineWidth = 0.08; c.strokeStyle = "#8a939e"; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
    });
  }

  /* Czaszka: perforowana kratka na czubku, obramowana linią */
  (function () {
    var srodek = norm(zKatow(8, 62));
    var e1 = norm([srodek[2], 0, -srodek[0]]);
    var e2 = norm([srodek[1] * e1[2] - srodek[2] * e1[1], srodek[2] * e1[0] - srodek[0] * e1[2], srodek[0] * e1[1] - srodek[1] * e1[0]]);
    var A = 0.3, B = 0.36, krok = 0.034;
    function naKuli(a, b) { return norm([srodek[0] + e1[0] * a + e2[0] * b, srodek[1] + e1[1] * a + e2[1] * b, srodek[2] + e1[2] * a + e2[2] * b]); }
    var obrys = [];
    for (var i = 0; i <= 48; i++) { var t = i / 48 * Math.PI * 2; obrys.push(naKuli(Math.cos(t) * (A + 0.03), Math.sin(t) * (B + 0.03))); }
    wielokat(obrys); k.fillStyle = "#e6e9ed"; k.fill();
    linia(obrys, 4, P.ciemny);
    for (var b = -B; b <= B; b += krok * 0.866) {
      var przes = Math.round((b + B) / (krok * 0.866)) % 2 ? krok / 2 : 0;
      for (var a = -A + przes; a <= A; a += krok) {
        if ((a / A) * (a / A) + (b / B) * (b / B) > 0.94) continue;
        otwor(naKuli(a, b), 0.11);
      }
    }
  })();

  /* Szczeliny: rzędy poziomych nacięć z boku czaszki i nad czołem */
  function szczeliny(bok0, bok1, gora0, ile, odstep) {
    for (var i = 0; i < ile; i++) {
      linia([zKatow(bok0, gora0 - i * odstep), zKatow((bok0 + bok1) / 2, gora0 - i * odstep + 0.6), zKatow(bok1, gora0 - i * odstep)], 5, P.ciemny);
    }
  }
  szczeliny(48, 80, 50, 7, 3.2);
  szczeliny(-58, -30, 46, 4, 3.2);
  szczeliny(18, 40, 38, 5, 2.6);

  /* Porty i sieć cienkich linii (jak ścieżki na płytce) */
  var portCzolo = zKatow(46, 30), portSkron = zKatow(70, 12), portUcho = zKatow(95, 24);
  var portZuchwa = zTwarzy(4.9, -6.4), glosnikP = zTwarzy(4.3, -2.2);
  var portTyl = zKatow(118, 8), portDol = zKatow(96, -22);
  var kropkaNos = zTwarzy(1.9, -2.9), kropkaPol = zTwarzy(-4.6, -3.1), krazekOko = zTwarzy(-3.6, -0.3);
  [
    [portCzolo, zKatow(58, 22), portSkron],
    [portSkron, zKatow(76, -2), glosnikP],
    [glosnikP, zTwarzy(5.3, -4.6), portZuchwa],
    [portSkron, portUcho, portTyl],
    [portZuchwa, zKatow(82, -16), portDol],
    [glosnikP, kropkaNos],
    [portCzolo, zKatow(22, 44), zKatow(-8, 52)],
    [zKatow(-50, 30), zKatow(-68, 10), zKatow(-72, -12), kropkaPol],
    [portTyl, zKatow(140, 20), zKatow(160, 40)],
  ].forEach(function (l) { linia(l, 3, P.ciemny); });
  // Łączenie „maski twarzy” wzdłuż skroni
  linia([zKatow(30, 40), zKatow(52, 30), zKatow(64, 14), zKatow(66, -6), zTwarzy(6.4, -5.6), zTwarzy(4.5, -8.0)], 3, "#8d96a1");
  port(portCzolo, 0.85);
  port(portSkron, 0.75);
  port(portUcho, 0.9);
  port(portZuchwa, 0.8);
  port(portTyl, 0.95);
  port(portDol, 0.7);
  port(zKatow(-50, 30), 0.8);
  glosnik(glosnikP, 1.25);
  kropka(kropkaNos, 0.2);
  kropka(kropkaPol, 0.2);
  kropka(zTwarzy(-1.5, -7.2), 0.16);
  krazekSiatki(krazekOko, 0.85);

  /* Brwi: żebrowane pasy zamiast malowanych włosków */
  [T.brewP, T.brewL].forEach(function (brew) {
    var kier = brew.map(function (p) { return zTwarzy(p[0], p[1]); });
    k.save();
    wielokat(kier); k.fillStyle = "#eef0f3"; k.fill(); k.clip();
    var gora = brew.slice(0, 5), dol = brew.slice(5).reverse();
    for (var i = 0; i <= 40; i++) {
      var t = i / 40 * 4, i0 = Math.min(3, Math.floor(t)), f = t - i0;
      var g = [gora[i0][0] + (gora[i0 + 1][0] - gora[i0][0]) * f, gora[i0][1] + (gora[i0 + 1][1] - gora[i0][1]) * f];
      var d = [dol[i0][0] + (dol[i0 + 1][0] - dol[i0][0]) * f, dol[i0][1] + (dol[i0 + 1][1] - dol[i0][1]) * f];
      linia([zTwarzy(g[0], g[1] + 0.2), zTwarzy(d[0], d[1] - 0.2)], 2.2, P.zebra);
    }
    k.restore();
  });

  /* Wargi: odcień i pionowe żeberka */
  (function () {
    var kier = T.wargi.map(function (p) { return zTwarzy(p[0], p[1]); });
    k.save();
    wielokat(kier); k.fillStyle = P.wargi; k.fill(); k.clip();
    for (var x = -2.6; x <= 2.6; x += 0.13) linia([zTwarzy(x, -3.1), zTwarzy(x, -5.6)], 1.6, P.zebra);
    k.restore();
    linia(T.liniaUst.map(function (p) { return zTwarzy(p[0], p[1]); }), 2.5, "#5b636e");
  })();

  /* Oczy: ciemna linia rzęs na górnej powiece, jaśniejsza na dolnej */
  [T.okoP, T.okoL].forEach(function (oko) {
    var dol = oko.slice(0, 9), gora = oko.slice(8).concat([oko[0]]);
    linia(gora.map(function (p) { return zTwarzy(p[0], p[1] + 0.03); }), 5, "#2a3038");
    linia(dol.map(function (p) { return zTwarzy(p[0], p[1] - 0.02); }), 2.5, "#8f98a3");
    // Załamanie powieki nad okiem
    linia(gora.slice(1, -1).map(function (p) { return zTwarzy(p[0] * 1.02, p[1] + 0.55); }), 2, "#b8c0c9");
  });

  /* Nos: delikatne nozdrza */
  [-1, 1].forEach(function (s) {
    wPunkcie(zTwarzy(s * 0.62, -1.95), function (c) {
      c.fillStyle = "#9aa3ae"; c.beginPath(); c.ellipse(0, 0, 0.3, 0.12, s * 0.35, 0, 7); c.fill();
    });
  });

  /* Broda: czarny, żebrowany wkład */
  (function () {
    var obrys = [[-1.1, -7.0], [0, -6.9], [1.1, -7.0], [1.55, -8.6], [1.0, -9.25], [0, -9.35], [-1.0, -9.25], [-1.55, -8.6]]
      .map(function (p) { return zTwarzy(p[0], p[1]); });
    k.save();
    wielokat(obrys); k.fillStyle = P.ciemny; k.fill(); k.clip();
    for (var x = -1.8; x <= 1.8; x += 0.16) linia([zTwarzy(x, -6.8), zTwarzy(x, -9.5)], 2.2, "#77818c");
    k.restore();
    linia(obrys.concat([obrys[0]]), 2.5, "#8d96a1");
  })();

  return plotno;
}

/* Szyja: żebrowany przód, poziome nacięcia po bokach */
function rysujSzyje(P) {
  var W = 512, H = 512;
  var c = document.createElement("canvas");
  c.width = W; c.height = H;
  var k = c.getContext("2d");
  k.fillStyle = "#ffffff"; k.fillRect(0, 0, W, H);
  // u = 0,5 to przód szyi; góra płótna to góra szyi
  k.fillStyle = P.ciemny;
  k.beginPath(); k.ellipse(W * 0.5, H * 0.36, W * 0.05, H * 0.28, 0, 0, 7); k.fill();
  k.strokeStyle = "#8a939e"; k.lineWidth = 2;
  for (var x = W * 0.455; x <= W * 0.545; x += 7) { k.beginPath(); k.moveTo(x, H * 0.08); k.lineTo(x, H * 0.64); k.stroke(); }
  k.fillStyle = P.ciemny;
  [0.27, 0.73].forEach(function (u) {
    for (var v = 0.12; v < 0.8; v += 0.055) k.fillRect(W * u - 22, H * v, 44, 7);
  });
  for (var x2 = -W * 0.08; x2 <= W * 0.08; x2 += 7) k.fillRect((x2 + W) % W, H * 0.1, 3, H * 0.7);
  k.fillRect(0, H * 0.86, W, 5);
  return c;
}

/* --- Budowa sceny --- */

function zbudujAndroida(THREE, RoomEnvironment, kontener, meski) {
  var P = TWARZE_ANDROIDA[meski ? "unitx" : "nova"];
  var T = przygotujTwarzMP();
  var O = SRODEK_GLOWY;
  var sx = P.szerTwarzy;
  function sxy(y) { return skalaX(P, y); }

  var rozmiar = Math.max(60, kontener.clientWidth || 86);
  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(rozmiar, rozmiar);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  kontener.innerHTML = "";
  kontener.appendChild(renderer.domElement);

  var scena = new THREE.Scene();
  var pmrem = new THREE.PMREMGenerator(renderer);
  var otoczenie = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scena.environment = otoczenie;
  scena.environmentIntensity = 0.5;
  pmrem.dispose();

  // Wymiary w centymetrach — kadr: cała głowa i kawałek szyi
  var kamera = new THREE.PerspectiveCamera(22, 1, 1, 400);
  kamera.position.set(3, 4, 84);
  kamera.lookAt(0.5, -1.8, 0);

  var klucz = new THREE.DirectionalLight(0xffffff, 2.4);
  klucz.position.set(-3, 2.5, 3.5);
  scena.add(klucz);
  var kontra = new THREE.DirectionalLight(new THREE.Color(P.oczy).lerp(new THREE.Color(0xffffff), 0.4), 2.2);
  kontra.position.set(4, 1.5, -2.5);
  scena.add(kontra);
  var wypelnienie = new THREE.DirectionalLight(0xdfe8ff, 0.6);
  wypelnienie.position.set(2, -1, 3);
  scena.add(wypelnienie);

  /* --- Głowa --- */

  var okaP = T.okoP.map(function (p) { return [p[0] * sxy(p[1]), p[1]]; });
  var okaL = T.okoL.map(function (p) { return [p[0] * sxy(p[1]), p[1]]; });
  function promienW(d) { return promienCzaszki(P, d[0], d[1], d[2]); }

  // Liczenie głowy trwa chwilę, więc wynik zostaje w pamięci: gdy panel
  // lektora pojawia się ponownie (następna lekcja), twarz jest od razu.
  var klucz = meski ? "unitx" : "nova";
  var dane = Android3D._pamiec[klucz] || (Android3D._pamiec[klucz] = policzGlowe());

  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(dane.pozycje, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(dane.normalne, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(dane.uv, 2));
  geo.setIndex(dane.indeks);
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = dane.minyP.map(function (a) { return new THREE.BufferAttribute(a, 3); });
  geo.morphAttributes.normal = dane.minyN.map(function (a) { return new THREE.BufferAttribute(a, 3); });

  function policzGlowe() {
    var geo = new THREE.SphereGeometry(1, 240, 200);
    var poz = geo.attributes.position, uv = geo.attributes.uv;
    var ile = poz.count;
    var baza = new Float32Array(ile * 3);
    var wagaTwarzy = new Float32Array(ile);

    for (var i = 0; i < ile; i++) {
      // Szew kuli przekręcamy na tył głowy
      var dx = -poz.getZ(i), dy = poz.getY(i), dz = poz.getX(i);
      var g = punktGlowy(P, T, dx, dy, dz);
      baza[i * 3] = O[0] + g.r * dx;
      baza[i * 3 + 1] = O[1] + g.r * dy;
      baza[i * 3 + 2] = O[2] + g.r * dz;
      wagaTwarzy[i] = g.w;
    }

    // Przestawia punkt na powierzchnię twarzy w (x, y) i poprawia mu współrzędne tekstury
    function ustawNaTwarzy(j, x, y) {
      var z = T.wys(x / sxy(y), y);
      baza[j * 3] = x; baza[j * 3 + 1] = y; baza[j * 3 + 2] = z;
      var ddx = x - O[0], ddy = y - O[1], ddz = z - O[2], l = Math.hypot(ddx, ddy, ddz);
      var phi = Math.atan2(-ddx / l, -ddz / l);
      if (phi < 0) phi += 2 * Math.PI;
      uv.setXY(j, phi / (2 * Math.PI), 1 - Math.acos(Math.max(-1, Math.min(1, ddy / l))) / Math.PI);
    }

    // Otwory: migdałowe oczy i szpara ust. Trójkąty wewnątrz wycinamy,
    // a brzegowe punkty dociągamy dokładnie do obrysu — krawędź jest gładka.
    var xk = T.kacikWew * sxy(T.yUst(T.kacikWew));
    function yUstH(x) { return T.yUst(x / sxy(T.yUst(0))); }
    var idx = geo.index.array;
    var zostaw = [];
    var brzeg = new Int8Array(ile); // 1, 2 — oczy; 3 — nad szparą ust; 4 — pod nią
    var wKept = new Uint8Array(ile), wCut = new Uint8Array(ile);
    var podUstami = new Float32Array(ile);
    function nadUstami(v) { return baza[v * 3 + 1] > yUstH(baza[v * 3]); }

    for (var j = 0; j < ile; j++) {
      var bx = baza[j * 3], by = baza[j * 3 + 1], yl0 = yUstH(bx);
      if (baza[j * 3 + 2] > 0 && Math.abs(bx) < xk + 0.6 && by < yl0 && by > yl0 - 3.5) podUstami[j] = 1;
    }

    for (var f = 0; f < idx.length; f += 3) {
      var a = idx[f], b = idx[f + 1], c = idx[f + 2];
      var cx = (baza[a * 3] + baza[b * 3] + baza[c * 3]) / 3;
      var cy = (baza[a * 3 + 1] + baza[b * 3 + 1] + baza[c * 3 + 1]) / 3;
      var cz = (baza[a * 3 + 2] + baza[b * 3 + 2] + baza[c * 3 + 2]) / 3;
      var wyciete = 0;
      if (cz > 1) {
        if (wWielokacie(cx, cy, okaP)) wyciete = 1;
        else if (wWielokacie(cx, cy, okaL)) wyciete = 2;
        else {
          var nad = nadUstami(a) + nadUstami(b) + nadUstami(c);
          var wSzer = Math.abs(baza[a * 3]) < xk && Math.abs(baza[b * 3]) < xk && Math.abs(baza[c * 3]) < xk;
          if (wSzer && nad > 0 && nad < 3) wyciete = 3;
        }
      }
      if (wyciete) {
        [a, b, c].forEach(function (v) {
          wCut[v] = 1;
          brzeg[v] = wyciete < 3 ? wyciete : (nadUstami(v) ? 3 : 4);
        });
      } else {
        zostaw.push(a, b, c);
        wKept[a] = 1; wKept[b] = 1; wKept[c] = 1;
      }
    }
    for (var q = 0; q < ile; q++) {
      if (!(wCut[q] && wKept[q])) continue;
      var qx = baza[q * 3], qy = baza[q * 3 + 1];
      if (brzeg[q] === 1 || brzeg[q] === 2) {
        var n = najblizszyNaObwodzie(qx, qy, brzeg[q] === 1 ? okaP : okaL);
        ustawNaTwarzy(q, n[0], n[1]);
      } else {
        ustawNaTwarzy(q, qx, yUstH(qx) + (brzeg[q] === 3 ? 0.006 : -0.006));
        podUstami[q] = brzeg[q] === 4 ? 1 : 0;
      }
    }

    poz.array.set(baza);
    poz.needsUpdate = true;
    uv.needsUpdate = true;
    geo.setIndex(zostaw);
    geo.computeVertexNormals();

    var normalneBazy = geo.attributes.normal.array.slice();
    var minyP = [], minyN = [];
    var pomocnicza = new THREE.BufferGeometry();
    pomocnicza.setIndex(zostaw);
    MINY_ANDROIDA.forEach(function (nazwa) {
      var roznica = new Float32Array(ile * 3);
      var cel = new Float32Array(ile * 3);
      for (var j2 = 0; j2 < ile; j2++) {
        var p = [baza[j2 * 3], baza[j2 * 3 + 1], baza[j2 * 3 + 2]];
        var d = mina(P, T, nazwa, p, wagaTwarzy[j2], podUstami[j2]);
        roznica[j2 * 3] = d[0]; roznica[j2 * 3 + 1] = d[1]; roznica[j2 * 3 + 2] = d[2];
        cel[j2 * 3] = p[0] + d[0]; cel[j2 * 3 + 1] = p[1] + d[1]; cel[j2 * 3 + 2] = p[2] + d[2];
      }
      pomocnicza.setAttribute("position", new THREE.BufferAttribute(cel, 3));
      pomocnicza.computeVertexNormals();
      var nn = pomocnicza.attributes.normal.array;
      var roznicaN = new Float32Array(ile * 3);
      for (var z2 = 0; z2 < ile * 3; z2++) roznicaN[z2] = nn[z2] - normalneBazy[z2];
      minyP.push(roznica);
      minyN.push(roznicaN);
    });
    pomocnicza.dispose();
    var wynik = {
      pozycje: geo.attributes.position.array, normalne: normalneBazy, uv: geo.attributes.uv.array,
      indeks: zostaw, minyP: minyP, minyN: minyN, plotno: rysujTeksture(P, T, promienW),
    };
    geo.dispose();
    return wynik;
  }

  var mapa = new THREE.CanvasTexture(dane.plotno);
  mapa.colorSpace = THREE.SRGBColorSpace;
  mapa.anisotropy = 4;
  var mSkora = new THREE.MeshPhysicalMaterial({
    color: P.skora, map: mapa, bumpMap: mapa, bumpScale: 2.2,
    roughness: 0.3, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.1,
    side: THREE.DoubleSide,
  });
  var twarz = new THREE.Mesh(geo, mSkora);
  var wplyw = twarz.morphTargetInfluences;
  var numer = {};
  MINY_ANDROIDA.forEach(function (nz, jn) { numer[nz] = jn; });

  // Głowa obraca się wokół szczytu szyi, jak u człowieka
  var PIVOT = [0, -4.5, -3.2];
  var glowa = new THREE.Group();
  glowa.position.set(PIVOT[0], PIVOT[1], PIVOT[2]);
  scena.add(glowa);
  var wnetrze = new THREE.Group();
  wnetrze.position.set(-PIVOT[0], -PIVOT[1], -PIVOT[2]);
  glowa.add(wnetrze);
  wnetrze.add(twarz);

  var mCiemny = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.9 });

  // Wnętrze ust i górne zęby — widać je, gdy szczęka opada
  var yU0 = T.yUst(0);
  var jama = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0x120a0e, roughness: 0.9 }));
  var sxU = sxy(yU0);
  jama.scale.set(2.2 * sxU, 1.3, 1.6);
  jama.position.set(0, yU0 - 0.6, 3.1);
  wnetrze.add(jama);
  var zeby = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3 * sxU, 2.25 * sxU, 0.5, 32, 1, true, -0.85, 1.7),
    new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.35, side: THREE.DoubleSide })
  );
  zeby.scale.set(1, 1, 0.75);
  zeby.position.set(0, yU0 - 0.2, 4.95 - 2.3 * sxU * 0.75);
  wnetrze.add(zeby);

  /* --- Oczy: gałki za migdałowymi otworami --- */

  var mBialko = new THREE.MeshPhysicalMaterial({ color: 0xeef2f5, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  var mTeczowka = new THREE.MeshStandardMaterial({ color: 0x0a1822, roughness: 0.35, metalness: 0.3,
    emissive: new THREE.Color(P.oczy), emissiveIntensity: 0.08 });
  var mPierscien = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.oczy), toneMapped: false });
  var mZrenica = new THREE.MeshBasicMaterial({ color: 0x030507 });
  var mBlask = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  var mPowieka = new THREE.MeshPhysicalMaterial({ color: P.skora, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });

  var R = 1.22;
  var oczy = [okaP, okaL].map(function (obrys) {
    var sxo = 0, syo = 0;
    obrys.forEach(function (p) { sxo += p[0]; syo += p[1]; });
    sxo /= obrys.length; syo /= obrys.length;
    var zPrzod = T.wys(sxo / sxy(syo), syo);
    var gniazdo = new THREE.Group();
    gniazdo.position.set(sxo, syo, zPrzod - R * 0.97);
    wnetrze.add(gniazdo);

    var oczodol = new THREE.Mesh(new THREE.SphereGeometry(R * 1.5, 20, 14), mCiemny);
    oczodol.position.z = -R * 0.55;
    gniazdo.add(oczodol);

    var galka = new THREE.Group();
    gniazdo.add(galka);
    galka.add(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), mBialko));
    var przod = R * 0.985;
    var teczowka = new THREE.Mesh(new THREE.CircleGeometry(R * 0.5, 32), mTeczowka);
    teczowka.position.z = przod; galka.add(teczowka);
    var pierscien = new THREE.Mesh(new THREE.RingGeometry(R * 0.3, R * 0.46, 40), mPierscien);
    pierscien.position.z = przod + 0.005; galka.add(pierscien);
    var zrenica = new THREE.Mesh(new THREE.CircleGeometry(R * 0.2, 24), mZrenica);
    zrenica.position.z = przod + 0.01; galka.add(zrenica);
    var blask = new THREE.Mesh(new THREE.CircleGeometry(R * 0.07, 12), mBlask);
    blask.position.set(R * 0.14, R * 0.16, przod + 0.015); galka.add(blask);

    // Powieki schowane pod porcelaną; przy mrugnięciu zjeżdżają na gałkę
    var gorna = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mPowieka);
    gniazdo.add(gorna);
    var dolna = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mPowieka);
    gniazdo.add(dolna);
    return { galka: galka, gorna: gorna, dolna: dolna };
  });

  /* --- Uszy: ludzki kształt z porcelany --- */

  var mUcho = new THREE.MeshPhysicalMaterial({ color: P.skora, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  var mUchoWew = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(P.skora).multiplyScalar(0.86), roughness: 0.4, clearcoat: 0.6 });
  [-1, 1].forEach(function (s) {
    var d = [s * 0.97, 0.02, -0.24];
    var l = Math.hypot(d[0], d[1], d[2]);
    var r = promienCzaszki(P, d[0] / l, d[1] / l, d[2] / l);
    var ucho = new THREE.Group();
    ucho.position.set(O[0] + r * d[0] / l - s * 0.25, O[1] + r * d[1] / l + 0.4, O[2] + r * d[2] / l);
    ucho.rotation.set(-0.22, s * 0.22, 0);
    wnetrze.add(ucho);
    var plat = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mUcho);
    plat.scale.set(0.45, 3.0, 1.7);
    plat.position.x = s * 0.25;
    ucho.add(plat);
    var obrecz = new THREE.Group();
    obrecz.scale.set(1, 2.75, 1.5);
    obrecz.position.x = s * 0.55;
    var torus = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 12, 48, Math.PI * 1.6), mUcho);
    torus.rotation.set(0, Math.PI / 2, Math.PI * 0.75);
    obrecz.add(torus);
    ucho.add(obrecz);
    var muszla = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mUchoWew);
    muszla.scale.set(0.2, 1.2, 0.75);
    muszla.position.set(s * 0.62, -0.3, 0.15);
    ucho.add(muszla);
  });

  /* --- Szyja i ramiona (nie ruszają się z głową) --- */

  var mapaSzyi = new THREE.CanvasTexture(rysujSzyje(P));
  mapaSzyi.colorSpace = THREE.SRGBColorSpace;
  var mSzyja = new THREE.MeshPhysicalMaterial({ color: P.skora, map: mapaSzyi, bumpMap: mapaSzyi, bumpScale: 2,
    roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  var gs = meski ? 1.1 : 1;
  var profil = [[10, -22], [7.5, -20.5], [5.4, -18], [4.6, -14.5], [4.3, -10], [4.3, -6], [4.4, -1.5]]
    .map(function (p) { return new THREE.Vector2(p[0] * gs, p[1]); });
  var szyja = new THREE.Mesh(new THREE.LatheGeometry(profil, 48, Math.PI, Math.PI * 2), mSzyja);
  szyja.scale.z = 0.92;
  szyja.position.set(0, 0, -3.4);
  szyja.rotation.x = 0.16;
  scena.add(szyja);
  var ramiona = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshPhysicalMaterial({
    color: P.skora, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }));
  ramiona.scale.set(17 * gs, 5, 8);
  ramiona.position.set(0, -24.5, -4.5);
  scena.add(ramiona);

  /* --- Animacja --- */

  var st = {
    stan: "czeka", emocja: "neutralna", odEmocji: 0,
    glosnosc: 0, celGlosnosci: 0,
    mrugDo: 0, nastepneMrug: 1.2,
    ostatnia: 0, zyje: true, dt: 1 / 30, start: -1,
    rot: { x: 0, y: -0.5, z: 0 }, pozY: 0,
    wzrok: { x: 0, y: 0 },
    powieki: { gora: -1.25, dol: 1.2 },
    miny: {},
  };
  MINY_ANDROIDA.forEach(function (nz) { st.miny[nz] = 0; });

  // Wygładzanie zależne od czasu, nie od liczby klatek
  function lagodnie(a, b, tempo) {
    return a + (b - a) * (1 - Math.pow(1 - Math.min(tempo, 0.999), st.dt * 30));
  }

  // Docelowe miny dla emocji; egzaminator pokazuje tylko stany, bez emocji
  function celMin() {
    var c = { szczeka: 0, usmiech: P.usmiechBazowy, smutek: 0, dziob: 0, brwi: 0, brwiWew: 0, brewP: 0 };
    var e = meski ? "neutralna" : st.emocja;
    if (e === "radosc") { c.usmiech = 1; c.brwi = 0.2; }
    if (e === "rozbawienie") { c.usmiech = 1; c.szczeka = 0.3; c.brwi = 0.3; }
    if (e === "zaciekawienie") { c.brewP = 0.9; c.usmiech = 0.35; }
    if (e === "zdziwienie") { c.brwi = 1; c.szczeka = 0.45; c.dziob = 0.4; c.usmiech = 0; }
    if (e === "troska") { c.brwiWew = 1; c.smutek = 0.6; c.usmiech = 0; }

    if (st.stan === "slucha") { c.brwi = Math.max(c.brwi, 0.3); }
    if (st.stan === "mysli") { c.brewP = 0.7; c.dziob = 0.25; c.usmiech = 0; }
    if (st.stan === "mowi") { c.szczeka = 0.08 + st.glosnosc * 0.7; }
    return c;
  }

  function klatka(czasMs) {
    if (!st.zyje) return;
    requestAnimationFrame(klatka);
    if (czasMs - st.ostatnia < 32) return; // ok. 30 klatek/s wystarczy twarzy
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
    MINY_ANDROIDA.forEach(function (nz) {
      var tempo = nz === "szczeka" ? 0.5 : 0.12;
      st.miny[nz] = lagodnie(st.miny[nz], cel[nz], tempo);
      wplyw[numer[nz]] = st.miny[nz];
    });

    /* Głowa: poza trzech czwartych, oczy w kamerę */
    var ZWROT = -0.5;
    var r = { x: 0.02, y: ZWROT + Math.sin(t * 0.45) * 0.05, z: 0 };
    if (stan === "slucha") { r.x = 0.07 + Math.sin(t * 2.6) * 0.03; r.z = -0.05; r.y = ZWROT + 0.08; }
    if (stan === "mysli") { r.x = -0.08; r.y = ZWROT - 0.15; r.z = 0.06; }
    if (stan === "mowi") { r.x = Math.sin(t * 2.9) * 0.02; r.y = ZWROT + 0.05 + Math.sin(t * 1.2) * 0.05; }
    if (e === "zaciekawienie") r.z -= 0.08;
    if (e === "troska") r.x += 0.06;
    var wiek = t - st.odEmocji;
    var podskok = (e === "radosc" || e === "rozbawienie") && wiek < 1.2 ? Math.abs(Math.sin(wiek * 8)) * 0.3 * (1 - wiek / 1.2) : 0;

    st.rot.x = lagodnie(st.rot.x, r.x, 0.1);
    st.rot.y = lagodnie(st.rot.y, r.y, 0.1);
    st.rot.z = lagodnie(st.rot.z, r.z, 0.1);
    st.pozY = lagodnie(st.pozY, Math.sin(t * 1.4) * 0.12 + podskok, 0.25);
    glowa.rotation.set(st.rot.x, st.rot.y, st.rot.z);
    glowa.position.y = PIVOT[1] + st.pozY;

    /* Wzrok: w kamerę; przy myśleniu w górę i w bok */
    var w = { x: 0.03, y: -st.rot.y * 0.8 };
    if (stan === "mysli") { w.x = -0.25; w.y = -0.1; }
    if (stan === "czeka" && Math.sin(t * 0.7) > 0.93) w.y += 0.12;
    st.wzrok.x = lagodnie(st.wzrok.x, w.x, 0.2);
    st.wzrok.y = lagodnie(st.wzrok.y, w.y, 0.2);

    /* Powieki: mruganie, mrużenie przy uśmiechu */
    if (t > st.nastepneMrug) {
      st.mrugDo = t + 0.13;
      st.nastepneMrug = t + 2.2 + Math.random() * 3.8;
    }
    var gora = -1.25, dol = 1.2;
    if (e === "radosc" || e === "rozbawienie") dol = 0.95;
    if (e === "troska" || stan === "mysli") gora = -1.05;
    if (t < st.mrugDo) { gora = 0.05; dol = 1.0; }
    st.powieki.gora = t < st.mrugDo ? gora : lagodnie(st.powieki.gora, gora, 0.45);
    st.powieki.dol = lagodnie(st.powieki.dol, dol, 0.3);

    oczy.forEach(function (o) {
      o.galka.rotation.set(st.wzrok.x, st.wzrok.y, 0);
      o.gorna.rotation.x = st.powieki.gora;
      o.dolna.rotation.x = st.powieki.dol;
    });

    // Tęczówki jaśnieją, gdy android słucha albo mówi
    mTeczowka.emissiveIntensity = stan === "slucha" ? 0.15 + 0.1 * Math.abs(Math.sin(t * 3.5))
      : stan === "mowi" ? 0.08 + st.glosnosc * 0.12 : 0.08;

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
      mapa.dispose(); mapaSzyi.dispose(); otoczenie.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

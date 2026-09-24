/* ============================================================
   Robot 3D — lektor i egzaminator w prawdziwym 3D (WebGL, Three.js)

   Robot jest zbudowany z brył w kodzie, bez plików modeli: kask, ciemny
   wizjer, świecące oczy, usta z diod, antena i "uszy" z pierścieniami.
   Dzięki temu całość to jeden mały skrypt, a nie kilka megabajtów grafiki.

   Biblioteka Three.js wczytuje się dopiero przy pierwszej rozmowie
   (dynamiczny import), więc ekran główny nie płaci za nią ani bajtem.
   Po pierwszym razie leży w pamięci service workera i działa offline.

   Robot mówi tym samym językiem co rysowana Emma: stany (czeka, mowi,
   slucha, mysli) i emocje (neutralna, radosc, zaciekawienie, zdziwienie,
   troska, rozbawienie). Awatar przekazuje je tutaj bez zmian.
   ============================================================ */

var Robot3D = {
  _three: null,

  // WebGL bywa wyłączony (stare telefony, oszczędzanie baterii) — wtedy
  // aplikacja zostaje przy rysowanej twarzy zamiast pokazywać pusty kwadrat
  dostepny: function () {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) {
      return false;
    }
  },

  _wczytaj: function () {
    if (!this._three) {
      var adres = new URL("js/vendor/three.module.min.js", document.baseURI).href;
      this._three = import(adres);
    }
    return this._three;
  },

  /**
   * Buduje robota w kontenerze. Zwraca obietnicę instancji:
   *   { ustawStan, ustawEmocje, slowo, zniszcz }
   * wariant: "lektor" (biały z zielonym, ciepły) albo "egzaminator" (stalowy, niebieskie oczy)
   */
  utworz: async function (kontener, wariant) {
    var THREE = await this._wczytaj();
    return zbudujRobota(THREE, kontener, wariant === "egzaminator");
  },
};

/* --- Paleta obu robotów --- */

var PALETY_ROBOTA = {
  // Nova: perłowa biel z miętowym akcentem marki i różowym blaskiem policzków
  lektor: {
    kask: 0xfbf4f7, akcent: 0x2bc49a, wizjer: 0x0a1426,
    oczy: 0x7ff5d9, rumieniec: 0xff8fb3,
  },
  egzaminator: {
    kask: 0xc9d1db, akcent: 0x44536a, wizjer: 0x070d16,
    oczy: 0x6cb4ff, rumieniec: 0x6cb4ff,
  },
};

var KOLORY_ANTENY = {
  czeka: 0x24c48f,   // spokojna zieleń: Twoja kolej
  slucha: 0xff5a5a,  // czerwień jak nagrywanie
  mysli: 0xffd24a,   // żółte mruganie: przetwarza
  mowi: 0x5ef2c8,    // turkus migający w rytm mowy
};

function zbudujRobota(THREE, kontener, egzaminator) {
  var paleta = PALETY_ROBOTA[egzaminator ? "egzaminator" : "lektor"];

  /* --- Scena, kamera, światło --- */

  var rozmiar = Math.max(60, kontener.clientWidth || 84);
  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(rozmiar, rozmiar);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  kontener.innerHTML = "";
  kontener.appendChild(renderer.domElement);

  var scena = new THREE.Scene();
  var kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  kamera.position.set(0, 0.22, 5.2);
  kamera.lookAt(0, 0.12, 0);

  scena.add(new THREE.HemisphereLight(0xffffff, 0x2a3440, 1.3));
  var klucz = new THREE.DirectionalLight(0xffffff, 2.4);
  klucz.position.set(2.5, 3, 4);
  scena.add(klucz);
  // Kontra w kolorze oczu — obrys głowy świeci jak w filmach o robotach
  var kontra = new THREE.DirectionalLight(paleta.oczy, 1.6);
  kontra.position.set(-3, 1.5, -2.5);
  scena.add(kontra);

  /* --- Materiały --- */

  // Nova ma perłową obudowę pod lakierem — z lekką opalizacją jak masa perłowa.
  // Egzaminator jest ze szczotkowanej stali: matowszy i poważniejszy.
  var mKask = egzaminator
    ? new THREE.MeshStandardMaterial({ color: paleta.kask, metalness: 0.55, roughness: 0.38 })
    : new THREE.MeshPhysicalMaterial({
        color: paleta.kask, metalness: 0.08, roughness: 0.22,
        clearcoat: 1, clearcoatRoughness: 0.08,
        iridescence: 0.35, iridescenceIOR: 1.4, iridescenceThicknessRange: [180, 420],
        sheen: 0.4, sheenColor: new THREE.Color(0xffd6e6),
      });
  var mAkcent = new THREE.MeshPhysicalMaterial({
    color: paleta.akcent, metalness: 0.3, roughness: 0.3, clearcoat: egzaminator ? 0.2 : 0.8,
  });
  var mWizjer = new THREE.MeshPhysicalMaterial({
    color: paleta.wizjer, metalness: 0.6, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05,
    // Delikatne podświetlenie od środka — wizjer wygląda jak szkło z ekranem, nie jak dziura
    emissive: new THREE.Color(egzaminator ? 0x0b1e3d : 0x0b2a3a), emissiveIntensity: 0.9,
  });
  // Świecące części nie reagują na światło i nie przechodzą przez mapowanie tonów,
  // żeby w małym medalionie były jasne i czytelne
  function swiatlo(kolor) {
    return new THREE.MeshBasicMaterial({ color: kolor, toneMapped: false, transparent: true });
  }
  var mOczy = swiatlo(paleta.oczy);
  var mUsta = swiatlo(paleta.oczy);
  var mRumieniec = swiatlo(paleta.rumieniec);
  mRumieniec.opacity = 0;
  var mAntena = swiatlo(KOLORY_ANTENY.czeka);
  var mUszy = swiatlo(paleta.oczy);

  /* --- Tułów (stoi w miejscu) --- */

  var tulow = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mAkcent);
  tulow.scale.set(1.35, 0.62, 0.95);
  tulow.position.set(0, -1.72, -0.1);
  scena.add(tulow);

  var szyja = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.5, 24), mKask);
  szyja.position.set(0, -1.12, 0);
  scena.add(szyja);

  /* --- Głowa (rusza się) --- */

  var glowa = new THREE.Group();
  scena.add(glowa);

  var kask = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 40), mKask);
  // Egzaminator ma szerszą, bardziej kanciastą głowę; Nova smukłą, jajowatą
  kask.scale.set(egzaminator ? 1.18 : 1.08, egzaminator ? 0.94 : 1.03, 1);
  glowa.add(kask);

  var wizjer = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 40), mWizjer);
  wizjer.scale.set(0.9, 0.66, 0.62);
  wizjer.position.set(0, -0.03, 0.44);
  glowa.add(wizjer);

  // Uszy: walce z pierścieniem, który świeci, gdy robot słucha
  var uszy = [];
  [-1, 1].forEach(function (strona) {
    var ucho = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 32), mAkcent);
    ucho.rotation.z = Math.PI / 2;
    ucho.position.set(strona * 1.13, 0, 0);
    glowa.add(ucho);

    var pierscien = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 10, 32), mUszy);
    pierscien.rotation.y = Math.PI / 2;
    pierscien.position.set(strona * 1.22, 0, 0);
    glowa.add(pierscien);
    uszy.push(pierscien);
  });

  // Antena z kulką, która mówi, co robot teraz robi
  var pret = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, egzaminator ? 0.26 : 0.38, 12), mAkcent);
  pret.position.set(0, egzaminator ? 1.05 : 1.12, 0);
  glowa.add(pret);
  var kulka = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), mAntena);
  kulka.position.set(0, egzaminator ? 1.22 : 1.35, 0);
  glowa.add(kulka);

  /* --- Twarz na wizjerze --- */

  // Punkt na powierzchni wizjera — oczy i usta mają leżeć na nim, a nie w powietrzu
  function naWizjerze(x, y) {
    var k = 1 - (x / 0.9) * (x / 0.9) - ((y + 0.03) / 0.66) * ((y + 0.03) / 0.66);
    return 0.44 + 0.62 * Math.sqrt(Math.max(0, k)) + 0.012;
  }

  var oczy = [-1, 1].map(function (strona) {
    var x = strona * 0.32;
    var y = 0.08;
    var grupa = new THREE.Group();
    grupa.position.set(x, y, naWizjerze(x, y));
    grupa.rotation.y = strona * 0.34;
    glowa.add(grupa);

    // Zwykłe oko: owal
    var owal = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32), mOczy);
    grupa.add(owal);
    // Uśmiechnięte oko: łuk ^
    var luk = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 8, 24, Math.PI), mOczy);
    luk.position.y = -0.04;
    luk.visible = false;
    grupa.add(luk);
    // Brew: cienka kreska nad okiem, niesie połowę emocji
    var brew = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.01), mOczy);
    brew.position.set(0, 0.22, 0);
    grupa.add(brew);

    // Rzęsy Novy: trzy kreski na zewnętrznym brzegu oka. Wiszą na owalu,
    // więc przy mrugnięciu schodzą w dół razem z nim.
    if (!egzaminator) {
      [[0.07, 0.1, 0.55], [0.1, 0.07, 0.95], [0.115, 0.025, 1.3]].forEach(function (r) {
        var rzesa = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.01), mOczy);
        rzesa.position.set(strona * (r[0] + 0.03), r[1] + 0.03, 0);
        rzesa.rotation.z = strona * r[2];
        owal.add(rzesa);
      });
    }

    return { strona: strona, grupa: grupa, owal: owal, luk: luk, brew: brew };
  });

  // Rumieńce — różowe kropki pod oczami przy radości
  [-1, 1].forEach(function (strona) {
    var x = strona * 0.5;
    var y = -0.14;
    var r = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), mRumieniec);
    r.position.set(x, y, naWizjerze(x, y));
    r.rotation.y = strona * 0.5;
    glowa.add(r);
  });

  // Usta: słupki jak korektor graficzny w trakcie mówienia, a poza nim mina
  var ustaY = -0.3;
  var ustaZ = naWizjerze(0, ustaY);
  var slupki = [];
  for (var i = 0; i < 5; i++) {
    var sx = (i - 2) * 0.085;
    var s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.01), mUsta);
    s.position.set(sx, ustaY, naWizjerze(sx, ustaY));
    s.rotation.y = sx * 0.6;
    s.visible = false;
    glowa.add(s);
    slupki.push(s);
  }

  var usmiech = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 28, Math.PI), mUsta);
  usmiech.rotation.z = Math.PI; // łuk w dół: ∪
  usmiech.position.set(0, ustaY + 0.06, ustaZ);
  glowa.add(usmiech);

  var kreska = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.01), mUsta);
  kreska.position.set(0, ustaY, ustaZ);
  glowa.add(kreska);

  var kolko = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.026, 8, 24), mUsta);
  kolko.position.set(0, ustaY, ustaZ);
  glowa.add(kolko);

  /* --- Stan i animacja --- */

  var st = {
    stan: "czeka",
    emocja: "neutralna",
    odEmocji: 0,       // kiedy zmieniła się emocja — do podskoku radości
    glosnosc: 0,       // obwiednia mowy 0..1
    celGlosnosci: 0,
    mrugDo: 0,
    nastepneMrug: 1.5,
    ostatniaKlatka: 0,
    zyje: true,
    dt: 1 / 30,
    start: -1,
    rot: { x: 0, y: 0, z: 0 },
    poz: { y: 0, z: 0 },
    kolorAnteny: new THREE.Color(KOLORY_ANTENY.czeka),
  };

  // Wygładzanie zależne od czasu, nie od liczby klatek: ta sama płynność
  // na szybkim telefonie i na słabym, który rysuje 10 klatek na sekundę.
  function lagodnie(obecna, cel, tempo) {
    return obecna + (cel - obecna) * (1 - Math.pow(1 - Math.min(tempo, 0.999), st.dt * 30));
  }

  function ustawMine() {
    var e = st.emocja;
    var mowi = st.stan === "mowi";
    var mysli = st.stan === "mysli";

    slupki.forEach(function (s) { s.visible = mowi; });
    usmiech.visible = !mowi && !mysli && ["neutralna", "radosc", "zaciekawienie", "rozbawienie"].indexOf(e) > -1;
    kreska.visible = !mowi && (mysli || e === "troska");
    kolko.visible = !mowi && !mysli && e === "zdziwienie";

    var szeroki = e === "radosc" || e === "rozbawienie";
    usmiech.scale.set(szeroki ? 1.2 : 0.75, szeroki ? 1.2 : 0.6, 1);
    kreska.rotation.z = e === "troska" && !mysli ? 0.12 : 0;

    oczy.forEach(function (o) {
      var usmiechniete = !mysli && szeroki;
      o.luk.visible = usmiechniete;
      o.owal.visible = !usmiechniete;
    });
  }

  function klatka(czasMs) {
    if (!st.zyje) return;
    requestAnimationFrame(klatka);

    // Około 30 klatek na sekundę wystarczy twarzy, a bateria to odczuje
    if (czasMs - st.ostatniaKlatka < 32) return;
    if (st.start < 0) st.start = czasMs;
    st.dt = Math.min(0.25, (czasMs - (st.ostatniaKlatka || czasMs - 33)) / 1000);
    st.ostatniaKlatka = czasMs;
    if (document.hidden || !kontener.isConnected || kontener.offsetParent === null) return;

    var t = (czasMs - st.start) / 1000;
    var e = st.emocja;
    var stan = st.stan;

    /* Ruch głowy: każdy stan ma swoją postawę, a przejścia są płynne */
    var cel = { x: 0, y: Math.sin(t * 0.5) * 0.1, z: 0 };
    var celPoz = { y: Math.sin(t * 1.6) * 0.03, z: 0 };

    if (stan === "slucha") {
      cel.x = 0.12 + Math.sin(t * 2.8) * 0.06; // potakiwanie
      cel.y = 0;
      celPoz.z = 0.15;                          // lekko do przodu, "słucham Cię"
    } else if (stan === "mysli") {
      cel.x = -0.18;
      cel.y = 0.28;
      cel.z = 0.12;
    } else if (stan === "mowi") {
      cel.x = Math.sin(t * 3.1) * 0.035;
      cel.y = Math.sin(t * 1.3) * 0.08;
    }

    if (e === "zaciekawienie") cel.z += -0.16;
    if (e === "zdziwienie") { cel.x -= 0.12; celPoz.z -= 0.15; }
    if (e === "troska") cel.x += 0.1;

    var wiekEmocji = t - st.odEmocji;
    if ((e === "radosc" || e === "rozbawienie") && wiekEmocji < 1.4) {
      celPoz.y += Math.abs(Math.sin(wiekEmocji * 9)) * 0.08 * (1 - wiekEmocji / 1.4);
    }

    st.rot.x = lagodnie(st.rot.x, cel.x, 0.12);
    st.rot.y = lagodnie(st.rot.y, cel.y, 0.12);
    st.rot.z = lagodnie(st.rot.z, cel.z, 0.12);
    st.poz.y = lagodnie(st.poz.y, celPoz.y, 0.2);
    st.poz.z = lagodnie(st.poz.z, celPoz.z, 0.12);
    glowa.rotation.set(st.rot.x, st.rot.y, st.rot.z);
    glowa.position.set(0, st.poz.y, st.poz.z);

    /* Oczy: kształt według emocji, wzrok według stanu, mruganie */
    if (t > st.nastepneMrug) {
      st.mrugDo = t + 0.12;
      st.nastepneMrug = t + 2 + Math.random() * 4 + (Math.random() < 0.15 ? -1.7 : 0);
    }
    var mrug = t < st.mrugDo ? 0.1 : 1;

    oczy.forEach(function (o) {
      var sx = 1, sy = 1.15, brewY = 0.22, brewRot = 0;

      if (e === "zdziwienie") { sx = 1.2; sy = 1.45; brewY = 0.3; }
      if (e === "zaciekawienie" && o.strona === 1) { sy = 1.35; brewY = 0.28; brewRot = 0.2; }
      if (e === "troska") { sy = 0.95; brewRot = -o.strona * 0.35; brewY = 0.24; }
      if (e === "radosc" || e === "rozbawienie") brewY = 0.27;
      if (stan === "mysli") { sy = 0.9; if (o.strona === -1) { brewY = 0.29; brewRot = 0.25; } }
      if (stan === "slucha") sy *= 1.08;

      o.owal.scale.x = lagodnie(o.owal.scale.x, sx, 0.25);
      o.owal.scale.y = lagodnie(o.owal.scale.y, sy * mrug, mrug < 1 ? 0.8 : 0.25);
      o.luk.scale.y = mrug < 1 ? 0.3 : 1;

      // Myślenie: wzrok w górę i w bok
      var wzrokX = stan === "mysli" ? 0.035 : 0;
      var wzrokY = stan === "mysli" ? 0.035 : 0;
      o.owal.position.x = lagodnie(o.owal.position.x, wzrokX, 0.2);
      o.owal.position.y = lagodnie(o.owal.position.y, wzrokY, 0.2);

      o.brew.position.y = lagodnie(o.brew.position.y, brewY, 0.2);
      o.brew.rotation.z = lagodnie(o.brew.rotation.z, brewRot, 0.2);
    });

    mRumieniec.opacity = lagodnie(mRumieniec.opacity, (e === "radosc" || e === "rozbawienie") && !egzaminator ? 0.75 : 0, 0.15);

    /* Usta: słupki podskakują w rytm mowy */
    if (stan === "mowi") {
      if (Math.random() < 0.3) st.celGlosnosci = Math.random() < 0.18 ? 0.1 : 0.35 + Math.random() * 0.65;
      st.glosnosc = lagodnie(st.glosnosc, st.celGlosnosci, 0.5);
      slupki.forEach(function (s, i) {
        var ksztalt = [0.55, 0.85, 1, 0.8, 0.5][i];
        var drganie = 0.75 + 0.25 * Math.sin(t * 17 + i * 1.9);
        s.scale.y = Math.max(0.22, st.glosnosc * ksztalt * drganie * 1.7);
      });
    } else {
      st.glosnosc = lagodnie(st.glosnosc, 0, 0.3);
    }

    /* Antena i uszy: kolor stanu, puls w rytmie tego, co się dzieje */
    st.kolorAnteny.lerp(new THREE.Color(KOLORY_ANTENY[stan] || KOLORY_ANTENY.czeka), 0.15);
    mAntena.color.copy(st.kolorAnteny);
    var puls = stan === "slucha" ? 0.55 + 0.45 * Math.sin(t * 6)
      : stan === "mysli" ? (Math.sin(t * 10) > 0 ? 1 : 0.35)
      : stan === "mowi" ? 0.5 + st.glosnosc * 0.5
      : 0.85;
    mAntena.opacity = puls;
    mUszy.opacity = stan === "slucha" ? 0.45 + 0.55 * Math.abs(Math.sin(t * 4)) : 0.35;

    renderer.render(scena, kamera);
  }

  ustawMine();
  requestAnimationFrame(klatka);

  return {
    ustawStan: function (stan) {
      st.stan = stan;
      ustawMine();
    },
    ustawEmocje: function (emocja) {
      st.emocja = emocja;
      st.odEmocji = st.start < 0 ? 0 : (performance.now() - st.start) / 1000;
      ustawMine();
    },
    // Granica słowa od syntezatora — słupki podskakują wyżej
    slowo: function () {
      st.celGlosnosci = 0.8 + Math.random() * 0.2;
    },
    zniszcz: function () {
      st.zyje = false;
      renderer.dispose();
      scena.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
      [mKask, mAkcent, mWizjer, mOczy, mUsta, mRumieniec, mAntena, mUszy].forEach(function (m) { m.dispose(); });
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

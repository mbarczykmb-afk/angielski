/* ============================================================
   Nova VRM — lektorka jako awatar 3D w stylu anime

   Gotowy, dopracowany model postaci (pixiv, VRM Public License 1.0 —
   zob. modele/nova-LICENCJA.txt) przebarwiony na asystentkę AI:
   platynowe włosy, turkusowe oczy, słuchawki ze świecącymi pierścieniami.

   Model ma wbudowane miny (radość, smutek, zdziwienie, spokój), mruganie
   i kształty ust do mowy (a, i, u, e, o), a włosy poruszają się fizyką.
   Sterowanie jest takie samo jak w pozostałych awatarach:
   { ustawStan, ustawEmocje, slowo, zniszcz }.
   ============================================================ */

var NovaVRM = {
  _moduly: null,
  _model: null, // rozpakowany plik modelu — przy następnej lekcji nie pobieramy go znowu

  dostepny: function () {
    return Robot3D.dostepny() && typeof DecompressionStream !== "undefined";
  },

  _wczytaj: function () {
    if (!this._moduly) {
      var baza = new URL("js/vendor/", document.baseURI).href;
      this._moduly = Promise.all([
        import(baza + "three.module.min.js"),
        import(baza + "GLTFLoader.js"),
        import(baza + "three-vrm.module.min.js"),
      ]);
    }
    return this._moduly;
  },

  // Plik leży spakowany gzipem (1,3 MB zamiast 4,7 MB). Gdyby serwer sam go
  // rozpakował po drodze, rozpoznajemy to po nagłówku i bierzemy jak jest.
  _pobierzModel: function () {
    if (!this._model) {
      var adres = new URL("modele/nova.vrm.gz", document.baseURI).href;
      this._model = fetch(adres).then(function (odp) {
        if (!odp.ok) throw new Error("Brak modelu Novy (" + odp.status + ")");
        return odp.arrayBuffer();
      }).then(function (dane) {
        var b = new Uint8Array(dane, 0, 2);
        if (b[0] !== 0x1f || b[1] !== 0x8b) return dane;
        var strumien = new Blob([dane]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(strumien).arrayBuffer();
      });
      // Nieudane pobranie nie może zablokować kolejnej próby
      this._model.catch(function () { NovaVRM._model = null; });
    }
    return this._model;
  },

  utworz: async function (kontener, wariant) {
    var wyniki = await Promise.all([this._wczytaj(), this._pobierzModel()]);
    var m = wyniki[0];
    return zbudujNoveVRM(m[0], m[1].GLTFLoader, m[2], wyniki[1], kontener, wariant === "egzaminator");
  },
};

async function zbudujNoveVRM(THREE, GLTFLoader, VRMlib, dane, kontener) {
  var loader = new GLTFLoader();
  loader.register(function (parser) { return new VRMlib.VRMLoaderPlugin(parser); });
  var gltf = await loader.parseAsync(dane.slice(0), "");
  var vrm = gltf.userData.vrm;
  VRMlib.VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMlib.VRMUtils.combineSkeletons(gltf.scene);
  VRMlib.VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse(function (o) { o.frustumCulled = false; });
  doroslaTwarz(vrm, NOVA_PROPORCJE);

  var rozmiar = Math.max(60, kontener.clientWidth || 86);
  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(rozmiar, rozmiar);
  kontener.innerHTML = "";
  kontener.appendChild(renderer.domElement);

  var scena = new THREE.Scene();
  scena.add(vrm.scene);
  // Ciepłe światło z przodu, chłodna turkusowa kontra z tyłu — jak w studiu
  var klucz = new THREE.DirectionalLight(0xffffff, 2.2);
  klucz.position.set(-0.6, 1.2, 1.5);
  scena.add(klucz);
  var kontra = new THREE.DirectionalLight(0x9feeff, 0.9);
  kontra.position.set(1.2, 0.8, -1);
  scena.add(kontra);
  scena.add(new THREE.AmbientLight(0xffffff, 0.35));

  var kosc = function (n) { return vrm.humanoid.getNormalizedBoneNode(n); };

  // Ręce wzdłuż tułowia (model zapisany jest w pozie T)
  kosc("leftUpperArm").rotation.z = -1.45;
  kosc("rightUpperArm").rotation.z = 1.45;
  kosc("leftLowerArm").rotation.z = -0.15;
  kosc("rightLowerArm").rotation.z = 0.15;

  /* Dorosłe proporcje: dłuższa szyja i mniejsza głowa względem ciała
     (duża głowa na krótkiej szyi to typowa sylwetka postaci-dziecka) */
  var P = NOVA_PROPORCJE;
  var surowaGlowa = vrm.humanoid.getRawBoneNode("head");
  surowaGlowa.position.y += P.szyja;
  surowaGlowa.scale.setScalar(P.glowa);

  /* Słuchawki AI: pałąk nad głową i nauszniki ze świecącym pierścieniem.
     Grupa ma tę samą skalę i przesunięcie co głowa, więc leżą na włosach. */
  var glowaK = kosc("head");
  var sluchawki = new THREE.Group();
  sluchawki.position.y = P.szyja;
  sluchawki.scale.setScalar(P.glowa);
  glowaK.add(sluchawki);
  var mSwiatlo = new THREE.MeshBasicMaterial({ color: 0x5ff3ff, toneMapped: false, transparent: true, opacity: 0.9 });
  var mObudowa = new THREE.MeshStandardMaterial({ color: 0xeef2f7, metalness: 0.55, roughness: 0.22 });
  var mSrodek = new THREE.MeshStandardMaterial({ color: 0x1a2233, metalness: 0.4, roughness: 0.4 });
  var R0 = 0.118, Y0 = 0.1, Z0 = -0.005;
  var palak = new THREE.Mesh(new THREE.TorusGeometry(R0, 0.006, 10, 64, Math.PI), mObudowa);
  palak.position.set(0, Y0, Z0);
  sluchawki.add(palak);
  var linia = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.0045, 0.0018, 6, 64, Math.PI), mSwiatlo);
  linia.position.copy(palak.position);
  sluchawki.add(linia);
  [-1, 1].forEach(function (s) {
    var g = new THREE.Group();
    g.position.set(s * R0, Y0 - 0.005, Z0);
    g.rotation.y = s * Math.PI / 2;
    var obudowa = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 40), mObudowa);
    obudowa.rotation.x = Math.PI / 2;
    g.add(obudowa);
    var pierscien = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0032, 8, 48), mSwiatlo);
    pierscien.position.z = 0.0095;
    g.add(pierscien);
    var srodek = new THREE.Mesh(new THREE.CircleGeometry(0.012, 32), mSrodek);
    srodek.position.z = 0.0092;
    g.add(srodek);
    sluchawki.add(g);
  });

  /* Naszyjnik: cienki łańcuszek i świecący wisiorek */
  var szyjaK = kosc("neck");
  var mLancuszek = new THREE.MeshStandardMaterial({ color: 0xe9eef5, metalness: 0.9, roughness: 0.2 });
  // Choker: cienka obręcz na szyi ze świecącą linią i małym wisiorkiem z przodu
  var lancuszek = new THREE.Mesh(new THREE.TorusGeometry(P.naszyjnikR, 0.0028, 8, 64), mLancuszek);
  lancuszek.rotation.x = Math.PI / 2 + 0.12;
  lancuszek.scale.set(1, 0.9, 1);
  lancuszek.position.set(0, P.naszyjnikY, 0.004);
  szyjaK.add(lancuszek);
  var swiecaca = new THREE.Mesh(new THREE.TorusGeometry(P.naszyjnikR + 0.0012, 0.0011, 6, 64), mSwiatlo);
  swiecaca.rotation.copy(lancuszek.rotation);
  swiecaca.scale.copy(lancuszek.scale);
  swiecaca.position.copy(lancuszek.position).add(new THREE.Vector3(0, -0.003, 0));
  szyjaK.add(swiecaca);
  var wisiorek = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), mSwiatlo);
  wisiorek.scale.set(0.8, 1.3, 0.5);
  wisiorek.position.set(0, P.naszyjnikY - 0.012, P.naszyjnikR * 0.9 + 0.006);
  szyjaK.add(wisiorek);

  // Kamera celuje w twarz: kadr głowa i ramiona
  vrm.update(0);
  var pGlowy = new THREE.Vector3();
  glowaK.getWorldPosition(pGlowy);
  var kamera = new THREE.PerspectiveCamera(18, 1, 0.1, 20);
  // Ujęcie lekko z boku (trzy czwarte) i odrobinę z dołu — portretowe, dorosłe
  kamera.position.set(pGlowy.x + P.kameraX, pGlowy.y + P.kameraY, pGlowy.z + P.kameraZ);
  kamera.lookAt(pGlowy.x + P.celX, pGlowy.y + P.celY, pGlowy.z);

  // Oczy patrzą w kamerę; cel lekko się przesuwa (drobne ruchy oczu, „myślenie”)
  var celWzroku = new THREE.Object3D();
  scena.add(celWzroku);
  celWzroku.position.copy(kamera.position);
  vrm.lookAt.target = celWzroku;

  // Mechanizm skręcania kości w ramionach dochodzi do równowagi po kilku krokach
  for (var i = 0; i < 30; i++) vrm.update(1 / 30);

  /* --- Animacja --- */

  var em = vrm.expressionManager;
  var MINY = ["happy", "relaxed", "sad", "surprised", "angry"];
  var USTA = ["aa", "ih", "ou", "ee", "oh"];
  var st = {
    stan: "czeka", emocja: "neutralna", odEmocji: 0,
    glosnosc: 0, celGlosnosci: 0, gloska: "aa", zmianaGloski: 0,
    mrugDo: 0, nastepneMrug: 1.5,
    ostatnia: 0, zyje: true, dt: 1 / 30, start: -1,
    miny: {}, usta: {},
    rot: { x: 0, y: 0, z: 0 },
  };
  MINY.forEach(function (n) { st.miny[n] = 0; });
  USTA.forEach(function (n) { st.usta[n] = 0; });

  function lagodnie(a, b, tempo) {
    return a + (b - a) * (1 - Math.pow(1 - Math.min(tempo, 0.999), st.dt * 30));
  }

  // Docelowe miny dla emocji z rozmowy
  function celMin() {
    var c = { happy: 0, relaxed: 0.2, sad: 0, surprised: 0, angry: 0 };
    var e = st.emocja;
    if (e === "radosc") { c.happy = 0.55; c.relaxed = 0.3; }
    if (e === "rozbawienie") { c.happy = 0.95; c.relaxed = 0; }
    if (e === "zaciekawienie") { c.relaxed = 0.45; c.surprised = 0.15; }
    if (e === "zdziwienie") { c.surprised = 0.75; c.relaxed = 0; }
    if (e === "troska") { c.sad = 0.55; c.relaxed = 0; }
    if (st.stan === "mysli") { c.relaxed = 0.1; }
    // W trakcie mówienia miny łagodnieją, żeby nie gryzły się z ruchem ust
    if (st.stan === "mowi") { c.happy *= 0.55; c.surprised *= 0.5; }
    return c;
  }

  function klatka(czasMs) {
    if (!st.zyje) return;
    requestAnimationFrame(klatka);
    if (czasMs - st.ostatnia < 32) return; // ok. 30 klatek/s
    if (st.start < 0) st.start = czasMs;
    st.dt = Math.min(0.25, (czasMs - (st.ostatnia || czasMs - 33)) / 1000);
    st.ostatnia = czasMs;
    if (document.hidden || !kontener.isConnected || kontener.offsetParent === null) return;
    var szer = kontener.clientWidth;
    if (szer && Math.abs(szer - rozmiar) > 1) { rozmiar = szer; renderer.setSize(rozmiar, rozmiar, false); }

    var t = (czasMs - st.start) / 1000;
    var stan = st.stan;

    /* Mowa: obwiednia głośności i zmieniające się głoski */
    if (stan === "mowi") {
      if (Math.random() < 0.3) st.celGlosnosci = Math.random() < 0.18 ? 0.05 : 0.35 + Math.random() * 0.65;
      st.glosnosc = lagodnie(st.glosnosc, st.celGlosnosci, 0.5);
      if (t > st.zmianaGloski) {
        var los = Math.random();
        st.gloska = los < 0.38 ? "aa" : los < 0.56 ? "oh" : los < 0.72 ? "ee" : los < 0.86 ? "ih" : "ou";
        st.zmianaGloski = t + 0.08 + Math.random() * 0.09;
      }
    } else {
      st.glosnosc = lagodnie(st.glosnosc, 0, 0.35);
    }
    USTA.forEach(function (n) {
      var cel = n === st.gloska ? st.glosnosc * (n === "aa" ? 0.85 : 0.7) : 0;
      st.usta[n] = lagodnie(st.usta[n], cel, 0.55);
      em.setValue(n, st.usta[n]);
    });

    var cele = celMin();
    MINY.forEach(function (n) {
      st.miny[n] = lagodnie(st.miny[n], cele[n], 0.12);
      em.setValue(n, st.miny[n]);
    });

    /* Mruganie (przy szerokim uśmiechu oczy i tak są zmrużone) */
    if (t > st.nastepneMrug) {
      st.mrugDo = t + 0.14;
      st.nastepneMrug = t + 2.4 + Math.random() * 3.6;
    }
    em.setValue("blink", t < st.mrugDo ? 1 : 0);

    /* Głowa i tułów: oddech, delikatny ruch, postawa według stanu */
    var r = { x: Math.sin(t * 0.9) * 0.02, y: Math.sin(t * 0.47) * 0.05, z: Math.sin(t * 0.33) * 0.02 };
    if (stan === "slucha") { r.x = 0.06 + Math.sin(t * 2.4) * 0.025; r.z = 0.09; }
    if (stan === "mysli") { r.x = -0.06; r.y = 0.18; r.z = -0.07; }
    if (stan === "mowi") { r.x = Math.sin(t * 3.1) * 0.03; r.y = Math.sin(t * 1.3) * 0.07; }
    if (st.emocja === "zaciekawienie") r.z += 0.1;
    if (st.emocja === "troska") r.x += 0.07;
    var wiek = t - st.odEmocji;
    if ((st.emocja === "radosc" || st.emocja === "rozbawienie") && wiek < 1) r.x -= Math.sin(wiek * Math.PI) * 0.06;
    st.rot.x = lagodnie(st.rot.x, r.x, 0.1);
    st.rot.y = lagodnie(st.rot.y, r.y, 0.1);
    st.rot.z = lagodnie(st.rot.z, r.z, 0.1);
    var szyja = kosc("neck");
    szyja.rotation.set(st.rot.x * 0.4, st.rot.y * 0.4, st.rot.z * 0.4);
    glowaK.rotation.set(st.rot.x * 0.6, st.rot.y * 0.6, st.rot.z * 0.6);
    var oddech = Math.sin(t * 1.7);
    kosc("spine").rotation.x = oddech * 0.012;
    var klatkaPiersiowa = kosc("chest");
    if (klatkaPiersiowa) klatkaPiersiowa.rotation.x = oddech * 0.01;

    /* Wzrok: w kamerę, przy myśleniu w górę i w bok */
    var wx = 0, wy = 0;
    if (stan === "mysli") { wx = 0.35; wy = 0.3; }
    else if (Math.sin(t * 0.8) > 0.92) { wx = 0.06; }
    celWzroku.position.set(kamera.position.x + wx, kamera.position.y + wy, kamera.position.z);

    // Pierścienie słuchawek świecą mocniej, gdy Nova słucha albo mówi
    mSwiatlo.opacity = stan === "slucha" ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3.2))
      : stan === "mowi" ? 0.6 + st.glosnosc * 0.4 : 0.75;

    vrm.update(st.dt);
    renderer.render(scena, kamera);
  }

  requestAnimationFrame(klatka);

  return {
    ustawStan: function (stan) { st.stan = stan; },
    ustawEmocje: function (emocja) {
      st.emocja = emocja || "neutralna";
      st.odEmocji = st.start < 0 ? 0 : (performance.now() - st.start) / 1000;
    },
    slowo: function () { st.celGlosnosci = 0.75 + Math.random() * 0.25; },
    zniszcz: function () {
      st.zyje = false;
      VRMlib.VRMUtils.deepDispose(vrm.scene);
      scena.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

/* Proporcje i kadr. Model wyjściowy to postać nastoletnia w stylu anime;
   te ustawienia robią z niej dorosłą kobietę. */
var NOVA_PROPORCJE = {
  oczyX: 0.8, oczyY: 0.7,    // mniejsze, bardziej migdałowe oczy
  zuchwa: 0.3,               // dolna część twarzy dłuższa — wyraźniejsza broda
  szyja: 0.022,              // dłuższa szyja (m)
  glowa: 0.9,                // mniejsza głowa względem ciała
  naszyjnikR: 0.043, naszyjnikY: 0.03,
  kameraX: 0.42, kameraY: 0.0, kameraZ: 1.38, celX: 0.0, celY: -0.03,
};

// Zmniejsza oczy (białka, tęczówki, rzęsy, odblaski) wokół środka każdego oka —
// razem z ich kształtami mimiki, żeby mruganie dalej pasowało
function doroslaTwarz(vrm, P) {
  var oczy = [], twarz = [];
  vrm.scene.traverse(function (o) {
    if (!o.isMesh || !o.geometry) return;
    var m = Array.isArray(o.material) ? o.material[0] : o.material;
    var nazwa = (m && m.name) || "";
    if (/EyeWhite|EyeIris|EyeHighlight|FaceEyeline/.test(nazwa)) oczy.push({ mesh: o, biale: /EyeWhite/.test(nazwa) });
    if (/Face_00_SKIN|FaceMouth/.test(nazwa)) twarz.push(o);
  });
  if (!oczy.length) return;

  // Środki oczu z białek: osobno lewe i prawe
  var srodki = { "-1": [0, 0, 0, 0], "1": [0, 0, 0, 0] };
  oczy.filter(function (e) { return e.biale; }).forEach(function (e) {
    var poz = e.mesh.geometry.attributes.position;
    for (var i = 0; i < poz.count; i++) {
      var s = srodki[poz.getX(i) < 0 ? "-1" : "1"];
      s[0] += poz.getX(i); s[1] += poz.getY(i); s[2] += poz.getZ(i); s[3]++;
    }
  });
  Object.keys(srodki).forEach(function (k) { var s = srodki[k]; if (s[3]) { s[0] /= s[3]; s[1] /= s[3]; s[2] /= s[3]; } });

  var przerobione = new Set();
  oczy.forEach(function (e) {
    var geo = e.mesh.geometry;
    if (przerobione.has(geo)) return;
    przerobione.add(geo);
    var poz = geo.attributes.position;
    var strony = new Int8Array(poz.count);
    for (var i = 0; i < poz.count; i++) {
      var s = srodki[poz.getX(i) < 0 ? "-1" : "1"];
      strony[i] = poz.getX(i) < 0 ? -1 : 1;
      poz.setX(i, s[0] + (poz.getX(i) - s[0]) * P.oczyX);
      poz.setY(i, s[1] + (poz.getY(i) - s[1]) * P.oczyY);
    }
    poz.needsUpdate = true;
    // Kształty mimiki są względne (przesunięcia) — skalujemy je tak samo
    (geo.morphAttributes.position || []).forEach(function (cel) {
      for (var j = 0; j < cel.count; j++) {
        cel.setX(j, cel.getX(j) * P.oczyX);
        cel.setY(j, cel.getY(j) * P.oczyY);
      }
      cel.needsUpdate = true;
    });
    geo.computeBoundingSphere();
  });

  // Dłuższa żuchwa: punkty skóry poniżej linii nosa schodzą w dół proporcjonalnie
  // do odległości od niej. Szyja i brzeg twarzy (wysoko z tyłu) zostają na miejscu.
  var oczyY = (srodki["-1"][1] + srodki["1"][1]) / 2;
  var nosY = oczyY - 0.035;
  twarz.forEach(function (mesh) {
    var geo = mesh.geometry;
    if (przerobione.has(geo)) return;
    przerobione.add(geo);
    var poz = geo.attributes.position;
    var przod = srodki["1"][2];
    for (var i = 0; i < poz.count; i++) {
      var y = poz.getY(i);
      if (y >= nosY) continue;
      // Z tyłu głowy (za uszami) nic nie ruszamy — tam twarz łączy się z szyją
      var zPrzod = Math.max(0, Math.min(1, (poz.getZ(i) - (przod - 0.09)) / 0.06));
      poz.setY(i, y - (nosY - y) * P.zuchwa * zPrzod);
    }
    poz.needsUpdate = true;
    geo.computeBoundingSphere();
  });
}

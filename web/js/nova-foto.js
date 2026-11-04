/* ============================================================
   Nova ze zdjęć — lektorka jako animacja klatkowa

   Grafiki dostarczone przez właściciela aplikacji (folder Animacja/,
   przygotowane skryptem tools/awatar-foto.sh):
   - awatar/mowi.webp — 9 klatek: 1-4 mówienie, 5-7 uśmiech, 8-9 spokój
   - awatar/<mina>.webp — po 4 klatki: listening, question, confirmation,
     encouraging, surprise, frustrated

   Kadr od piersi w górę: kontener jest zaokrąglonym kwadratem, a grafika
   wypełnia go w całości (bez przycinania ramion). Przy zmianie zestawu
   klatek dwie warstwy płynnie się przenikają, żeby postać nie skakała.

   Sterowanie jak w pozostałych awatarach: { ustawStan, ustawEmocje, slowo, zniszcz }.
   ============================================================ */

var NovaFoto = {
  ZESTAWY: {
    mowi: 9, listening: 4, question: 4, confirmation: 4, encouraging: 4, surprise: 4, frustrated: 4,
  },

  dostepny: function () {
    return true;
  },

  _adres: function (nazwa) {
    return new URL("awatar/" + nazwa + ".webp", document.baseURI).href;
  },

  // Wszystkie paski naraz — przy zmianie miny nie może być mrugnięcia pustym tłem
  _wczytaj: function () {
    if (!this._obrazy) {
      var self = this;
      this._obrazy = Promise.all(Object.keys(this.ZESTAWY).map(function (n) {
        return new Promise(function (ok, blad) {
          var img = new Image();
          img.onload = ok;
          img.onerror = function () { blad(new Error("Brak grafiki " + n)); };
          img.src = self._adres(n);
        });
      }));
      this._obrazy.catch(function () { NovaFoto._obrazy = null; });
    }
    return this._obrazy;
  },

  utworz: function (kontener) {
    return this._wczytaj().then(function () { return zbudujNoveFoto(kontener); });
  },
};

function zbudujNoveFoto(kontener) {
  kontener.innerHTML = "";
  kontener.classList.add("foto");
  var warstwy = [0, 1].map(function () {
    var w = document.createElement("div");
    w.className = "nf-warstwa";
    kontener.appendChild(w);
    return w;
  });
  var aktywna = 0;

  var st = {
    stan: "czeka", emocja: "neutralna",
    zestaw: null, klatka: -1,
    nastepna: 0, mrugDo: 0, nastepneMrug: 2500,
    glosnosc: 0, zyje: true,
  };

  function pokaz(zestaw, klatka) {
    if (zestaw === st.zestaw && klatka === st.klatka) return;
    var n = NovaFoto.ZESTAWY[zestaw];
    var pozycja = n > 1 ? (klatka / (n - 1)) * 100 : 0;
    if (zestaw !== st.zestaw) {
      // Inny pasek: przygotowujemy go w ukrytej warstwie i płynnie przenikamy
      var nowa = warstwy[1 - aktywna];
      nowa.style.backgroundImage = 'url("' + NovaFoto._adres(zestaw) + '")';
      nowa.style.backgroundSize = n * 100 + "% 100%";
      nowa.style.backgroundPosition = pozycja + "% 0";
      nowa.classList.add("widoczna");
      warstwy[aktywna].classList.remove("widoczna");
      aktywna = 1 - aktywna;
    } else {
      warstwy[aktywna].style.backgroundPosition = pozycja + "% 0";
    }
    st.zestaw = zestaw;
    st.klatka = klatka;
  }

  // Co pokazać teraz: zestaw klatek, z których losujemy, i tempo zmian (ms)
  function plan() {
    if (st.stan === "mowi") return { zestaw: "mowi", klatki: [0, 1, 2, 3], tempo: [110, 170] };
    if (st.stan === "slucha") return { zestaw: "listening", klatki: [0, 1, 2, 3], tempo: [650, 900] };
    if (st.stan === "mysli") return { zestaw: "question", klatki: [0, 3], tempo: [900, 1300] };
    switch (st.emocja) {
      case "radosc": return { zestaw: "confirmation", klatki: [0, 1, 3], tempo: [700, 1000] };
      case "rozbawienie": return { zestaw: "mowi", klatki: [4, 5], tempo: [450, 700] };
      case "zaciekawienie": return { zestaw: "encouraging", klatki: [0, 1], tempo: [900, 1300] };
      case "zdziwienie": return { zestaw: "surprise", klatki: [2, 3], tempo: [900, 1400] };
      // Przy kłopotach ucznia lektorka dodaje otuchy — nie pokazujemy frustracji
      case "troska": return { zestaw: "encouraging", klatki: [1, 2], tempo: [900, 1300] };
      default: return { zestaw: "mowi", klatki: [7, 8], tempo: [1400, 2200] };
    }
  }

  function krok() {
    if (!st.zyje) return;
    var teraz = performance.now();
    if (!document.hidden && kontener.isConnected) {
      var p = plan();
      var spokoj = p.zestaw === "mowi" && p.klatki[0] === 7;

      // Mruganie w spokojnej pozie (klatka 7 GIF-a ma zamknięte oczy)
      if (spokoj && teraz > st.nastepneMrug) {
        st.mrugDo = teraz + 160;
        st.nastepneMrug = teraz + 2600 + Math.random() * 3400;
      }
      if (spokoj && teraz < st.mrugDo) {
        pokaz("mowi", 6);
      } else if (p.zestaw !== st.zestaw || p.klatki.indexOf(st.klatka) < 0 || teraz > st.nastepna) {
        var wybor = p.klatki;
        // W trakcie mowy po słowie częściej otwarte usta
        if (st.stan === "mowi" && st.glosnosc > 0.5) wybor = [1, 2, 3];
        var k = wybor[Math.floor(Math.random() * wybor.length)];
        if (wybor.length > 1 && k === st.klatka) k = wybor[(wybor.indexOf(k) + 1) % wybor.length];
        pokaz(p.zestaw, k);
        st.nastepna = teraz + p.tempo[0] + Math.random() * (p.tempo[1] - p.tempo[0]);
      }
      st.glosnosc *= 0.85;
    }
    setTimeout(krok, 60);
  }
  krok();

  return {
    ustawStan: function (stan) { st.stan = stan; st.nastepna = 0; },
    ustawEmocje: function (emocja) { st.emocja = emocja || "neutralna"; st.nastepna = 0; },
    slowo: function () { st.glosnosc = 1; },
    zniszcz: function () {
      st.zyje = false;
      kontener.classList.remove("foto");
      kontener.innerHTML = "";
    },
  };
}

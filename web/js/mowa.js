/* ============================================================
   Mowa — rozpoznawanie (mikrofon) i synteza (lektor)
   Web Speech API: na Galaxy S20 obsługuje to Chrome.
   ============================================================ */

var Mowa = {
  rozpoznawanie: null,
  slucha: false,
  glos: null,

  obslugiwaneSluchanie: function () {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  obslugiwaneMowienie: function () {
    return "speechSynthesis" in window;
  },

  /* --- Lektor --- */

  wybierzGlos: function () {
    if (!this.obslugiwaneMowienie()) return null;
    var glosy = window.speechSynthesis.getVoices();
    if (!glosy.length) return null;

    // Najpierw głos brytyjski lub amerykański, potem jakikolwiek angielski
    this.glos =
      glosy.find(function (g) { return /^en[-_](GB|US)/i.test(g.lang); }) ||
      glosy.find(function (g) { return /^en/i.test(g.lang); }) ||
      null;
    return this.glos;
  },

  /**
   * Czyta tekst po angielsku.
   * onKoniec — wołane, gdy lektor skończy. Na tym opiera się rozmowa bez rąk:
   * mikrofon włącza się dopiero wtedy, żeby nie nagrywać własnego głosu lektora.
   */
  powiedz: function (tekst, onKoniec, wolniej) {
    var ustawienia = (App.stan && App.stan.user.ustawienia) || {};

    if (!this.obslugiwaneMowienie() || !tekst || ustawienia.glos === false) {
      if (onKoniec) onKoniec();
      return;
    }

    window.speechSynthesis.cancel();

    var wypowiedz = new SpeechSynthesisUtterance(String(tekst));
    if (!this.glos) this.wybierzGlos();
    if (this.glos) wypowiedz.voice = this.glos;
    wypowiedz.lang = (this.glos && this.glos.lang) || "en-US";
    // Wzor do powtorzenia czytamy wolniej — uczen ma go odtworzyc, nie tylko zrozumiec
    wypowiedz.rate = Number(ustawienia.tempoMowy || 0.95) * (wolniej ? 0.8 : 1);

    var zakonczono = false;
    function koniec() {
      if (zakonczono) return;
      zakonczono = true;
      if (typeof Awatar !== "undefined" && Awatar.stan === "mowi") Awatar.ustawStan("czeka");
      if (onKoniec) onKoniec();
    }

    wypowiedz.onend = koniec;
    wypowiedz.onerror = koniec;

    // Twarz lektora rusza ustami w rytm mowy. Granice słów zgłasza nie każdy
    // syntezator — wtedy awatar i tak porusza ustami sam z siebie.
    wypowiedz.onstart = function () {
      if (typeof Awatar !== "undefined") Awatar.ustawStan("mowi");
    };
    wypowiedz.onboundary = function () {
      if (typeof Awatar !== "undefined") Awatar.slowo();
    };

    // Zabezpieczenie: w Chrome zdarza się, że onend nie przychodzi wcale.
    // Bez tego rozmowa bez rąk potrafiłaby zawisnąć na dobre.
    var limit = Math.max(4000, String(tekst).length * 90);
    setTimeout(koniec, limit);

    window.speechSynthesis.speak(wypowiedz);
  },

  cisza: function () {
    if (this.obslugiwaneMowienie()) window.speechSynthesis.cancel();
  },

  /* --- Mikrofon --- */

  /**
   * Składa zapis wypowiedzi z listy wyników rozpoznawania.
   *
   * Lista w zdarzeniu jest KUMULATYWNA — przy każdym zdarzeniu zawiera
   * wszystkie wyniki od początku nasłuchu, a nie tylko nowe. Dlatego tekst
   * budujemy zawsze od zera. Doklejanie przyrostów przy pomocy resultIndex
   * wydaje się oszczędniejsze, ale Chrome potrafi przysłać zdarzenie
   * wskazujące na wyniki już wcześniej zamknięte — i wtedy te same słowa
   * dokleją się po raz drugi i trzeci ("I I I was was was...").
   *
   * Składanie od zera jest odporne na powtórzone zdarzenia: ten sam wynik
   * policzony dwa razy daje ten sam tekst.
   *
   * narastajaco — Chrome na Androidzie w trybie ciągłym przysyła każdą
   * kolejną wersję zdania jako OSOBNY wynik: "is", "is something",
   * "is something strange"... Sklejone dawały "is is something is something
   * strange". W tym trybie wynik, który zaczyna się tak jak poprzedni,
   * zastępuje go, a krótsza, starsza wersja jest pomijana.
   */
  zlozZapis: function (wyniki, narastajaco) {
    var kawalki = [];

    function slowa(t) {
      return t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").trim().split(/\s+/).filter(Boolean);
    }
    // Ile pierwszych słów mają wspólnych
    function wspolnyPoczatek(a, b) {
      var n = 0;
      while (n < a.length && n < b.length && a[n] === b[n]) n++;
      return n;
    }

    for (var i = 0; i < wyniki.length; i++) {
      var wynik = wyniki[i];
      if (!wynik || !wynik[0]) continue;

      var fragment = String(wynik[0].transcript || "").trim();
      if (!fragment) continue;

      var ost = kawalki[kawalki.length - 1];
      if (narastajaco && ost) {
        var a = slowa(ost.tekst), b = slowa(fragment);
        var w = wspolnyPoczatek(a, b);
        // Nowa wersja tego samego zdania (czasem z poprawionym słowem na końcu)
        if (b.length >= a.length && w >= Math.max(1, Math.ceil(a.length * 0.6))) {
          ost.tekst = fragment;
          ost.koncowy = !!wynik.isFinal;
          continue;
        }
        // Starsza, krótsza wersja zdania, które już mamy
        if (b.length < a.length && w >= Math.max(1, Math.ceil(b.length * 0.6))) continue;
      }
      kawalki.push({ tekst: fragment, koncowy: !!wynik.isFinal });
    }

    var gotowe = "", czastkowe = "";
    kawalki.forEach(function (k) {
      if (k.koncowy) gotowe += (gotowe ? " " : "") + k.tekst;
      else czastkowe += (czastkowe ? " " : "") + k.tekst;
    });
    return { gotowe: gotowe, czastkowe: czastkowe };
  },

  /**
   * Nasłuch jednej wypowiedzi.
   * onTekst(tekst, koncowy) — wołane też dla wyników częściowych, żeby
   * uczeń widział na bieżąco, co zostało rozpoznane.
   */
  sluchaj: function (onTekst, onKoniec) {
    var Rozpoznawanie = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rozpoznawanie) {
      toast("Ta przeglądarka nie rozpoznaje mowy. Użyj Chrome.", false);
      if (onKoniec) onKoniec();
      return;
    }

    if (this.slucha) {
      this.stop();
      return;
    }

    this.cisza(); // lektor milknie, gdy uczeń zaczyna mówić

    var ustawienia = (App.stan && App.stan.user.ustawienia) || {};
    var pauza = Number(ustawienia.pauzaMs || 3500);

    var r = new Rozpoznawanie();
    r.lang = "en-US";
    r.interimResults = true;
    // Tryb ciągły plus własny licznik ciszy. Bez tego przeglądarka kończy
    // nagranie przy pierwszym zawahaniu, a uczący się języka waha się często —
    // szuka słowa w środku zdania i to jest normalna część mówienia.
    r.continuous = true;
    r.maxAlternatives = 1;

    var self = this;
    var finalne = "";
    var ostatnie = "";
    // Android przysyła kolejne wersje tego samego zdania jako osobne wyniki
    var narastajaco = /Android/i.test(navigator.userAgent || "");
    var licznik = null;
    var cokolwiekPowiedziano = false;

    function odlozKoniec(ile) {
      clearTimeout(licznik);
      licznik = setTimeout(function () {
        try { r.stop(); } catch (e) { /* już zatrzymane */ }
      }, ile);
    }

    r.onstart = function () {
      self.slucha = true;
      if (typeof Awatar !== "undefined") Awatar.ustawStan("slucha");
      document.getElementById("btn-mikrofon").classList.add("slucha");
      // Na rozpoczęcie mówienia dajemy więcej czasu niż na pauzę w środku zdania
      odlozKoniec(pauza + 4000);
    };

    r.onresult = function (zdarzenie) {
      var zapis = Mowa.zlozZapis(zdarzenie.results, narastajaco);

      finalne = zapis.gotowe;
      ostatnie = (zapis.gotowe + " " + zapis.czastkowe).trim();
      cokolwiekPowiedziano = true;
      onTekst(ostatnie, false);

      // Każde kolejne słowo odsuwa moment zakończenia — mów tyle, ile chcesz
      odlozKoniec(pauza);
    };

    r.onerror = function (zdarzenie) {
      if (zdarzenie.error === "not-allowed" || zdarzenie.error === "service-not-allowed") {
        toast("Brak zgody na mikrofon. Włącz ją w ustawieniach strony w Chrome.", false);
      } else if (zdarzenie.error !== "aborted" && zdarzenie.error !== "no-speech") {
        toast("Błąd mikrofonu: " + zdarzenie.error, false);
      }
    };

    r.onend = function () {
      clearTimeout(licznik);
      self.slucha = false;
      if (typeof Awatar !== "undefined" && Awatar.stan === "slucha") Awatar.ustawStan("czeka");

      var przycisk = document.getElementById("btn-mikrofon");
      if (przycisk) przycisk.classList.remove("slucha");
      self.rozpoznawanie = null;

      // Gdy nowsza, jeszcze niezamknięta wersja zdania zastąpiła zamkniętą,
      // bierzemy pełniejszy zapis — inaczej zgubilibyśmy końcówkę wypowiedzi
      var wynikKoncowy = ostatnie.length > finalne.trim().length ? ostatnie : finalne.trim();
      if (onKoniec) onKoniec(cokolwiekPowiedziano ? wynikKoncowy : "");
    };

    this.rozpoznawanie = r;
    try {
      r.start();
      // Flagę stawiamy od razu, nie dopiero w onstart. Zdarzenie startu przychodzi
      // z opóźnieniem, a w tej szczelinie drugie wywołanie sluchaj() przeszłoby
      // przez bramkę na początku funkcji i uruchomiło równoległy nasłuch —
      // dwa nasłuchy to każde słowo zapisane dwa razy.
      this.slucha = true;
    } catch (e) {
      this.slucha = false;
      toast("Nie udało się włączyć mikrofonu.", false);
    }
  },

  stop: function () {
    if (this.rozpoznawanie) {
      try { this.rozpoznawanie.stop(); } catch (e) { /* już zatrzymane */ }
    }
  },
};

// Lista głosów w Chrome ładuje się asynchronicznie
if (Mowa.obslugiwaneMowienie()) {
  window.speechSynthesis.onvoiceschanged = function () {
    Mowa.wybierzGlos();
  };
}

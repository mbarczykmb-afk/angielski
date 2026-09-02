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
  powiedz: function (tekst, onKoniec) {
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
    wypowiedz.rate = Number(ustawienia.tempoMowy || 0.95);

    var zakonczono = false;
    function koniec() {
      if (zakonczono) return;
      zakonczono = true;
      if (onKoniec) onKoniec();
    }

    wypowiedz.onend = koniec;
    wypowiedz.onerror = koniec;

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
      document.getElementById("btn-mikrofon").classList.add("slucha");
      // Na rozpoczęcie mówienia dajemy więcej czasu niż na pauzę w środku zdania
      odlozKoniec(pauza + 4000);
    };

    r.onresult = function (zdarzenie) {
      var czastkowe = "";

      for (var i = zdarzenie.resultIndex; i < zdarzenie.results.length; i++) {
        var wynik = zdarzenie.results[i];
        if (wynik.isFinal) finalne += wynik[0].transcript + " ";
        else czastkowe += wynik[0].transcript;
      }

      cokolwiekPowiedziano = true;
      onTekst((finalne + czastkowe).trim(), false);

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

      var przycisk = document.getElementById("btn-mikrofon");
      if (przycisk) przycisk.classList.remove("slucha");
      self.rozpoznawanie = null;

      if (onKoniec) onKoniec(cokolwiekPowiedziano ? finalne.trim() : "");
    };

    this.rozpoznawanie = r;
    try {
      r.start();
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

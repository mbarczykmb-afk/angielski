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

    var r = new Rozpoznawanie();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;

    var self = this;
    var ostatni = "";

    r.onstart = function () {
      self.slucha = true;
      document.getElementById("btn-mikrofon").classList.add("slucha");
    };

    r.onresult = function (zdarzenie) {
      var tekst = "";
      for (var i = zdarzenie.resultIndex; i < zdarzenie.results.length; i++) {
        tekst += zdarzenie.results[i][0].transcript;
      }
      ostatni = tekst;
      onTekst(tekst, zdarzenie.results[zdarzenie.results.length - 1].isFinal);
    };

    r.onerror = function (zdarzenie) {
      if (zdarzenie.error === "not-allowed" || zdarzenie.error === "service-not-allowed") {
        toast("Brak zgody na mikrofon. Włącz ją w ustawieniach strony w Chrome.", false);
      } else if (zdarzenie.error === "no-speech") {
        toast("Nic nie usłyszałem — spróbuj jeszcze raz.", false);
      } else if (zdarzenie.error !== "aborted") {
        toast("Błąd mikrofonu: " + zdarzenie.error, false);
      }
    };

    r.onend = function () {
      self.slucha = false;
      var przycisk = document.getElementById("btn-mikrofon");
      if (przycisk) przycisk.classList.remove("slucha");
      self.rozpoznawanie = null;
      if (onKoniec) onKoniec(ostatni);
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

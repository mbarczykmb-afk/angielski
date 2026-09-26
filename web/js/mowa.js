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

  // Numer wersji składania zapisu — widać go w diagnostyce mikrofonu,
  // więc od razu wiadomo, czy telefon ma już najnowszą poprawkę
  WERSJA_ZAPISU: 4,
  // Domyślny czas ciszy, po którym uznajemy wypowiedź za skończoną (ms)
  PAUZA_DOMYSLNA: 6000,
  diagnostyka: null,

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
    // Tryb narastający włączamy też sami, gdy widać jego ślad: kolejny wynik
    // powtarza CAŁY poprzedni i coś dodaje ("I would" -> "I would like").
    // Na zwykłych wynikach z komputera to się nie zdarza.
    if (!narastajaco) {
      var poprz = null;
      for (var n = 0; n < wyniki.length && !narastajaco; n++) {
        if (!wyniki[n] || !wyniki[n][0]) continue;
        var sl = slowa(String(wyniki[n][0].transcript || ""));
        if (!sl.length) continue;
        if (poprz && sl.length > poprz.length && poprz.every(function (x, j) { return sl[j] === x; })) narastajaco = true;
        poprz = sl;
      }
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
   * Zwija gotowy tekst z narastających wersji zdania:
   * "I I would I would like I would like to" -> "I would like to".
   *
   * Druga linia obrony, niezależna od tego, w jakim układzie przeglądarka
   * przysłała wyniki. Szukamy ciągu co najmniej 3 odcinków, z których każdy
   * zaczyna się całym poprzednim — to ślad narastania, a nie zwykłe
   * powtórzenie słowa ("very very good" zostaje nietknięte).
   */
  zwinNarastanie: function (tekst) {
    var W = String(tekst || "").trim().split(/\s+/).filter(Boolean);
    var n = W.length;
    function rowne(a, b) {
      return a.toLowerCase().replace(/[^a-z0-9']/g, "") === b.toLowerCase().replace(/[^a-z0-9']/g, "");
    }
    // Czy słowa od pozycji b powtarzają dlug słów od pozycji a
    function powtarza(a, b, dlug) {
      if (b + dlug > n) return false;
      for (var i = 0; i < dlug; i++) if (!rowne(W[a + i], W[b + i])) return false;
      return true;
    }
    // Najkrótszy odcinek od q (nie krótszy niż min), po którym zaraz następuje jego powtórka
    function odcinek(q, min) {
      for (var L = min; q + 2 * L <= n; L++) if (powtarza(q, q + L, L)) return L;
      return 0;
    }

    var wynik = [], p = 0;
    while (p < n) {
      var q = p, L = odcinek(p, 1), powtorki = 0, dlug = 0, pierwszy = L;
      while (L) {
        powtorki++;
        dlug = L;
        q += L;
        L = odcinek(q, dlug);
      }
      // Zdanie musi urosnąć — samo "no no no" to zwykłe powtórzenie
      if (powtorki >= 2 && dlug > pierwszy) {
        // Ostatnia wersja zdania zaczyna się w q; znamy na pewno jej pierwsze
        // dlug słów, resztę dopisze dalsza część pętli
        wynik.push.apply(wynik, W.slice(q, q + dlug));
        p = q + dlug;
      } else {
        wynik.push(W[p]);
        p++;
      }
    }
    return wynik.join(" ");
  },

  /**
   * Ile ciszy (ms) czekać po tych słowach, zanim uznamy wypowiedź za skończoną.
   * Zdanie urwane na spójniku, przyimku albo "um" wyraźnie jeszcze trwa —
   * uczący się szuka wtedy słowa, więc dostaje więcej czasu.
   */
  pauzaUcznia: function (ust) {
    ust = ust || {};
    var p = Number(ust.pauzaMs);
    // Dawna domyślna wartość (3,5 s) zapisywała się przy każdej zmianie ustawień.
    // Przed zmianą czasu (pauzaV2) traktujemy ją jak brak wyboru — nowy domyślny czas.
    if (!p || (!ust.pauzaV2 && p <= 3500)) return Mowa.PAUZA_DOMYSLNA;
    return p;
  },

  czasCiszy: function (tekst, pauza) {
    var slowa = String(tekst || "").toLowerCase().replace(/[^a-z' ]+/g, " ").trim().split(/\s+/);
    var ostatnie = slowa[slowa.length - 1] || "";
    return Mowa.URWANE.indexOf(ostatnie) >= 0 ? Math.round(pauza * 1.6) : pauza;
  },

  URWANE: ["and", "but", "or", "so", "because", "that", "which", "who", "when", "if", "than", "then",
    "the", "a", "an", "to", "of", "in", "on", "at", "for", "with", "about", "from", "my", "your", "our",
    "i", "i'm", "we", "you", "is", "are", "was", "were", "be", "have", "has", "would", "could", "should",
    "will", "can", "think", "like", "very", "really", "um", "uh", "er", "erm", "hmm", "mm", "well"],

  /**
   * Nasłuch jednej wypowiedzi — tak długiej, jak uczeń potrzebuje.
   *
   * Koniec wypowiedzi wyznacza WYŁĄCZNIE nasz licznik ciszy. Chrome (zwłaszcza
   * na Androidzie) sam przerywa nagrywanie po kilku sekundach milczenia, nawet
   * w trybie ciągłym — wtedy po cichu wznawiamy nasłuch i doklejamy dalszą część.
   * Pasek nad mikrofonem pokazuje, ile ciszy zostało; "+5 s" daje więcej czasu,
   * dotknięcie mikrofonu wysyła od razu.
   *
   * onTekst(tekst) — bieżący zapis, także częściowy
   * onKoniec(tekst) — cała wypowiedź ("" gdy nic nie padło)
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
    var pauza = Mowa.pauzaUcznia(ustawienia);
    var NA_START = 5000;        // na zebranie myśli przed pierwszym słowem
    var CALOSC_MAX = 180000;    // najdłuższa wypowiedź: 3 minuty

    var self = this;
    var start = Date.now();
    var dotychczas = "";        // tekst z wcześniejszych, już zamkniętych nagrań
    var sesja = { finalne: "", ostatnie: "" };
    var cokolwiekPowiedziano = false;
    var konczymy = false;
    var zakonczone = false;
    var bladKrytyczny = false;
    var termin = start + pauza + NA_START, okno = pauza + NA_START;
    var ostatniGlos = 0;
    var r = null, zegar = null;
    // Android przysyła kolejne wersje tego samego zdania jako osobne wyniki
    var narastajaco = /Android/i.test(navigator.userAgent || "");
    // Surowy zapis tego, co przysłała przeglądarka — widać go w Więcej
    var diag = Mowa.diagnostyka = {
      wersjaZapisu: Mowa.WERSJA_ZAPISU, kiedy: new Date().toISOString(),
      przegladarka: navigator.userAgent, zdarzenia: [], wznowienia: 0, wynik: null,
    };

    function tekstSesji() {
      return sesja.ostatnie.length > sesja.finalne.length ? sesja.ostatnie : sesja.finalne;
    }
    function tekstCaly() {
      var a = dotychczas.trim(), b = tekstSesji().trim();
      if (!a) return b;
      if (!b) return a;
      // Po wznowieniu Android bywa, że powtarza końcówkę — zwijamy narastanie
      return Mowa.zwinNarastanie(a + " " + b);
    }

    function ustawTermin(ms) {
      okno = ms;
      termin = Date.now() + ms;
    }

    function zakoncz() {
      if (konczymy) return;
      konczymy = true;
      try { if (r) r.stop(); } catch (e) { /* już zatrzymane */ }
      // Gdyby przeglądarka nie zgłosiła końca, kończymy sami
      setTimeout(dokoncz, 2500);
    }

    function dokoncz() {
      if (zakonczone) return;
      zakonczone = true;
      clearInterval(zegar);
      self.slucha = false;
      self.rozpoznawanie = null;
      self._zakoncz = null;
      self._dodajCzas = null;
      Mowa.pokazPasek(null);
      if (typeof Awatar !== "undefined" && Awatar.stan === "slucha") Awatar.ustawStan("czeka");
      var przycisk = document.getElementById("btn-mikrofon");
      if (przycisk) przycisk.classList.remove("slucha");

      dotychczas = tekstCaly();
      diag.wynik = dotychczas;
      if (onKoniec) onKoniec(cokolwiekPowiedziano ? dotychczas.trim() : "");
    }

    // Licznik ciszy i pasek postępu — 10 razy na sekundę
    zegar = setInterval(function () {
      var zostalo = termin - Date.now();
      if (zostalo <= 0 || Date.now() - start > CALOSC_MAX) {
        zakoncz();
        return;
      }
      Mowa.pokazPasek({
        ulamek: Math.max(0, Math.min(1, zostalo / okno)),
        sekundy: Math.ceil(zostalo / 1000),
        mowi: Date.now() - ostatniGlos < 700,
        zaczal: cokolwiekPowiedziano,
      });
    }, 100);

    function uruchom() {
      if (konczymy) return dokoncz();
      r = new Rozpoznawanie();
      r.lang = "en-US";
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 1;
      sesja = { finalne: "", ostatnie: "" };

      r.onresult = function (zdarzenie) {
        var zapis = Mowa.zlozZapis(zdarzenie.results, narastajaco);
        diag.zdarzenia.push({
          od: zdarzenie.resultIndex,
          wyniki: Array.prototype.slice.call(zdarzenie.results, -20).map(function (w) {
            return [String((w[0] && w[0].transcript) || "").slice(0, 90), w.isFinal ? 1 : 0];
          }),
        });
        if (diag.zdarzenia.length > 6) diag.zdarzenia.shift();

        // Druga linia obrony: zwijamy narastające wersje także w gotowym tekście
        sesja.finalne = Mowa.zwinNarastanie(zapis.gotowe);
        sesja.ostatnie = Mowa.zwinNarastanie((zapis.gotowe + " " + zapis.czastkowe).trim());
        cokolwiekPowiedziano = true;
        ostatniGlos = Date.now();

        var caly = tekstCaly();
        onTekst(caly, false);
        // Każde słowo odsuwa koniec; urwane zdanie dostaje więcej czasu
        ustawTermin(Mowa.czasCiszy(caly, pauza));
      };

      r.onerror = function (zdarzenie) {
        var b = zdarzenie.error;
        if (b === "not-allowed" || b === "service-not-allowed") {
          bladKrytyczny = true;
          toast("Brak zgody na mikrofon. Włącz ją w ustawieniach strony w Chrome.", false);
        } else if (b === "aborted") {
          bladKrytyczny = true; // ktoś inny przejął mikrofon albo nasłuch przerwano celowo
        } else if (b === "network" || b === "audio-capture") {
          bladKrytyczny = true;
          toast(b === "network" ? "Rozpoznawanie mowy potrzebuje internetu." : "Nie mogę użyć mikrofonu.", false);
        }
        // "no-speech" to tylko cisza — wznowimy nasłuch w onend
      };

      r.onend = function () {
        // Zamykamy to, co padło w tym nagraniu, i — jeśli licznik ciszy jeszcze
        // nie minął — od razu słuchamy dalej
        dotychczas = tekstCaly();
        sesja = { finalne: "", ostatnie: "" };
        if (!konczymy && !bladKrytyczny && Date.now() - start < CALOSC_MAX && diag.wznowienia < 60) {
          diag.wznowienia++;
          setTimeout(uruchom, 60);
          return;
        }
        dokoncz();
      };

      self.rozpoznawanie = r;
      try {
        r.start();
      } catch (e) {
        bladKrytyczny = true;
        toast("Nie udało się włączyć mikrofonu.", false);
        dokoncz();
      }
    }

    this._zakoncz = zakoncz;
    this._dodajCzas = function (ms) {
      termin += ms;
      okno = Math.max(okno, termin - Date.now());
    };

    // Flagę stawiamy od razu, nie dopiero po starcie nagrania. Inaczej drugie
    // wywołanie sluchaj() w tej szczelinie uruchomiłoby równoległy nasłuch.
    this.slucha = true;
    if (typeof Awatar !== "undefined") Awatar.ustawStan("slucha");
    var przycisk = document.getElementById("btn-mikrofon");
    if (przycisk) przycisk.classList.add("slucha");
    uruchom();
  },

  // Skończyłem — wyślij od razu
  stop: function () {
    if (this._zakoncz) this._zakoncz();
    else if (this.rozpoznawanie) {
      try { this.rozpoznawanie.stop(); } catch (e) { /* już zatrzymane */ }
    }
  },

  // "+5 s" — jeszcze myślę
  dodajCzas: function (ms) {
    if (this._dodajCzas) this._dodajCzas(ms || 5000);
  },

  /**
   * Pasek ciszy nad mikrofonem. stan = null chowa pasek.
   * stan: { ulamek 0..1 — ile czasu zostało, sekundy, mowi, zaczal }
   */
  pokazPasek: function (stan) {
    var pasek = document.getElementById("pasek-ciszy");
    if (!pasek) {
      var miejsce = document.getElementById("czat-podpowiedz");
      if (!miejsce || !stan) return;
      pasek = document.createElement("div");
      pasek.id = "pasek-ciszy";
      pasek.innerHTML = '<div class="pc-tor"><div class="pc-wypelnienie"></div></div>' +
        '<div class="pc-rzad"><span class="pc-opis"></span>' +
        '<button type="button" class="pc-wiecej" aria-label="Daj mi jeszcze 5 sekund">+5 s</button></div>';
      miejsce.parentNode.insertBefore(pasek, miejsce);
      pasek.querySelector(".pc-wiecej").onclick = function () { Mowa.dodajCzas(5000); };
    }
    if (!stan) { pasek.hidden = true; return; }
    pasek.hidden = false;

    var faza = stan.mowi ? "mowi" : !stan.zaczal ? "start" : stan.ulamek < 0.25 ? "koniec" : stan.ulamek < 0.5 ? "uwaga" : "cisza";
    pasek.dataset.faza = faza;
    pasek.querySelector(".pc-wypelnienie").style.transform = "scaleX(" + (stan.mowi ? 1 : stan.ulamek).toFixed(3) + ")";
    pasek.querySelector(".pc-opis").textContent =
      faza === "mowi" ? "Mówisz… pauza na zastanowienie jest OK"
      : faza === "start" ? "Zbierz myśli i zacznij mówić · " + stan.sekundy + " s"
      : "Cisza — wyślę za " + stan.sekundy + " s · dotknij mikrofonu, by wysłać teraz";
  },
};

// Lista głosów w Chrome ładuje się asynchronicznie
if (Mowa.obslugiwaneMowienie()) {
  window.speechSynthesis.onvoiceschanged = function () {
    Mowa.wybierzGlos();
  };
}

/* ============================================================
   Gadająca głowa — lektorka Emma (w kursie) i egzaminator (na maturze)

   Ilustracja SVG animowana w telefonie, bez wideo i bez zewnętrznych usług.
   Prawdziwe wideo-awatary wymagają płatnego serwisu, klucza i dodają sekundy
   opóźnienia do każdej odpowiedzi — a w rozmowie liczy się tempo.

   Twarz robi to, co robi rozmówca przy stoliku:
     - rusza ustami, gdy lektor mówi (w rytm słów, gdy przeglądarka je zgłasza),
     - patrzy uważnie i lekko kiwa głową, gdy uczeń mówi,
     - patrzy w bok, gdy "myśli" nad odpowiedzią,
     - reaguje emocją na to, co uczeń powiedział,
     - mruga, żeby nie wyglądać jak zdjęcie.

   To wspiera mówienie, a nie czytanie: sygnalizuje, czyja teraz kolej,
   bez patrzenia na napisy.
   ============================================================ */

var EMOCJE = ["neutralna", "radosc", "zaciekawienie", "zdziwienie", "troska", "rozbawienie"];

var Awatar = {
  el: null,          // korzeń SVG (rysowana twarz)
  robot: null,       // instancja robota 3D, gdy wybrany
  _proba: 0,         // numer wstawienia — spóźniony robot nie nadpisze nowszego panelu
  status: null,      // podpis pod imieniem
  stan: "czeka",     // czeka | mowi | slucha | mysli
  emocja: "neutralna",
  _mowa: null,       // uchwyt animacji ust
  _mrug: null,       // uchwyt mrugania
  _powrot: null,     // uchwyt powrotu do neutralnej miny

  /**
   * Który lektor na ekranie: "android" (twarz 3D), "robot" (robot 3D),
   * "twarz" (rysowana Emma) albo "brak".
   * Starsze ustawienia miały tylko przełącznik awatar: true/false.
   */
  styl: function () {
    var ust = (App.stan && App.stan.user.ustawienia) || {};
    if (["android", "robot", "twarz", "brak"].indexOf(ust.awatarStyl) >= 0) return ust.awatarStyl;
    return ust.awatar === false ? "brak" : "android";
  },

  wlaczony: function () {
    return this.styl() !== "brak";
  },

  // Czy coś stoi w panelu — rysowana twarz albo robot
  _zamontowany: function () {
    return !!(this.el || this.robot);
  },

  /**
   * Wstawia twarz do panelu nad rozmową.
   * wariant: "lektor" (Emma, ciepła) albo "egzaminator" (neutralny, w okularach)
   */
  pokaz: function (wariant) {
    var panel = document.getElementById("awatar-panel");
    if (!panel) return;

    if (!this.wlaczony()) {
      this.schowaj();
      return;
    }

    var egzaminator = wariant === "egzaminator";
    var styl = this.styl();
    if ((styl === "android" || styl === "robot") && !Robot3D.dostepny()) styl = "twarz";
    var klucz = (egzaminator ? "egzaminator" : "lektor") + "-" + styl;

    // Ten sam wariant już stoi — nie przerysowujemy, żeby nie gubić animacji
    if (this._zamontowany() && panel.dataset.wariant === klucz && !panel.hidden) return;

    this._odmontuj();
    panel.dataset.wariant = klucz;
    panel.hidden = false;

    if (styl === "android" || styl === "robot") {
      this._pokazRobota(panel, egzaminator, styl === "android" ? Android3D : Robot3D);
    } else {
      this._pokazTwarz(panel, egzaminator);
    }
  },

  _opis: function (egzaminator, robot) {
    var imie = egzaminator
      ? (robot ? "Unit X · egzaminator" : "Mr Harris · egzaminator")
      : (robot ? "Nova · lektorka" : "Emma · lektorka");
    return '<div class="awatar-opis"><b>' + imie + "</b>" +
      '<span id="awatar-status">' + (egzaminator ? "Egzamin ustny" : "Gotowa do rozmowy") + "</span></div>";
  },

  _pokazTwarz: function (panel, egzaminator) {
    panel.innerHTML = '<div class="awatar-twarz">' + rysunekTwarzy(egzaminator) + "</div>" + this._opis(egzaminator, false);
    this.el = panel.querySelector("svg");
    this.status = document.getElementById("awatar-status");
    this.ustawEmocje("neutralna");
    this.ustawStan("czeka");
    this._zacznijMrugac();
  },

  // Robot wczytuje się asynchronicznie (biblioteka 3D). Do tego czasu panel
  // pokazuje pustą, podświetloną tarczę, a gdy coś pójdzie nie tak — rysowaną twarz.
  _pokazRobota: function (panel, egzaminator, silnik) {
    var self = this;
    var proba = ++this._proba;

    panel.innerHTML = '<div class="awatar-twarz robot' + (egzaminator ? " egzaminator" : "") + '"></div>' +
      this._opis(egzaminator, true);
    this.status = document.getElementById("awatar-status");
    this.ustawStan(this.stan || "czeka");

    silnik.utworz(panel.querySelector(".awatar-twarz"), egzaminator ? "egzaminator" : "lektor")
      .then(function (robot) {
        // W międzyczasie panel mógł zostać przerysowany albo schowany
        if (proba !== self._proba) { robot.zniszcz(); return; }
        self.robot = robot;
        robot.ustawEmocje(self.emocja);
        robot.ustawStan(self.stan);
      })
      .catch(function (e) {
        console.warn("Robot 3D nie wystartował, zostaje rysowana twarz:", e);
        if (proba !== self._proba) return;
        panel.dataset.wariant = (egzaminator ? "egzaminator" : "lektor") + "-twarz";
        self._pokazTwarz(panel, egzaminator);
      });
  },

  _odmontuj: function () {
    this._proba++;
    if (this.robot) {
      this.robot.zniszcz();
      this.robot = null;
    }
    this._zatrzymajUsta();
    clearTimeout(this._mrug);
    this.el = null;
  },

  schowaj: function () {
    var panel = document.getElementById("awatar-panel");
    if (panel) {
      panel.hidden = true;
      panel.dataset.wariant = "";
    }
    this._odmontuj();
  },

  ustawStan: function (stan) {
    this.stan = stan;
    if (this.robot) this.robot.ustawStan(stan);
    if (!this.el && !this.status) return;

    if (this.el) {
      ["czeka", "mowi", "slucha", "mysli"].forEach(function (s) {
        Awatar.el.classList.toggle("stan-" + s, s === stan);
      });
    }

    var panel = document.getElementById("awatar-panel");
    if (panel) panel.dataset.stan = stan;

    var podpisy = { mowi: "mówi…", slucha: "słucha Cię…", mysli: "zastanawia się…", czeka: "Twoja kolej" };
    if (this.status) this.status.textContent = podpisy[stan] || "";

    // Ruch ust liczymy tu tylko dla rysowanej twarzy — robot ma własny korektor
    if (this.el && stan === "mowi") this._zacznijUsta();
    else this._zatrzymajUsta();
  },

  /**
   * Emocja po wypowiedzi ucznia. Po kilku sekundach twarz wraca do spokojnej
   * miny — ciągły uśmiech od ucha do ucha wygląda sztucznie.
   */
  ustawEmocje: function (emocja, naIle) {
    if (EMOCJE.indexOf(emocja) < 0) emocja = "neutralna";
    this.emocja = emocja;
    if (this.robot) this.robot.ustawEmocje(emocja);
    if (!this._zamontowany()) return;

    if (this.el) {
      EMOCJE.forEach(function (e) {
        Awatar.el.classList.toggle("emocja-" + e, e === emocja);
      });
    }

    clearTimeout(this._powrot);
    if (emocja !== "neutralna") {
      this._powrot = setTimeout(function () { Awatar.ustawEmocje("neutralna"); }, naIle || 6000);
    }
  },

  /* --- Usta: ruch w trakcie mówienia --- */

  // Przeglądarka zgłasza początek każdego słowa — wtedy usta otwierają się szerzej
  slowo: function () {
    if (this.stan !== "mowi") return;
    if (this.robot) this.robot.slowo();
    if (this.el) this._otworz(0.75 + Math.random() * 0.25);
  },

  _otworz: function (ile) {
    if (!this.el) return;
    this.el.style.setProperty("--usta", ile.toFixed(2));
  },

  // Nie każdy syntezator zgłasza granice słów (na Androidzie bywa różnie),
  // więc usta ruszają się też same, nieregularnie — jak przy prawdziwej mowie
  _zacznijUsta: function () {
    this._zatrzymajUsta();
    var self = this;
    var cel = 0.5;
    var teraz = 0.2;
    this._mowa = setInterval(function () {
      if (Math.random() < 0.35) cel = Math.random() < 0.2 ? 0.08 : 0.25 + Math.random() * 0.75;
      teraz += (cel - teraz) * 0.55;
      self._otworz(teraz);
    }, 70);
  },

  _zatrzymajUsta: function () {
    clearInterval(this._mowa);
    this._mowa = null;
    this._otworz(0);
  },

  /* --- Mruganie --- */

  _zacznijMrugac: function () {
    clearTimeout(this._mrug);
    var self = this;
    function mrugnij() {
      if (!self.el) return;
      self.el.classList.add("mrug");
      setTimeout(function () { if (self.el) self.el.classList.remove("mrug"); }, 140);
      // Odstępy nieregularne: 2–6 s, czasem podwójne mrugnięcie
      var za = 2000 + Math.random() * 4000;
      if (Math.random() < 0.15) za = 260;
      self._mrug = setTimeout(mrugnij, za);
    }
    this._mrug = setTimeout(mrugnij, 1500);
  },
};

/* --- Rysunek twarzy ---

   Wszystkie ruchome części mają własne klasy, a miny przełącza CSS
   (app.css, sekcja "Gadająca głowa"). Dzięki temu JS zmienia tylko klasy,
   a przejścia między minami są płynne. */

function rysunekTwarzy(egzaminator) {
  var wlosy = egzaminator ? "#8a8f98" : "#4a2e22";
  var sweter = egzaminator ? "#3b4250" : "#1d9e75";
  var skora = egzaminator ? "#e9b994" : "#f3c9a6";

  var fryzura = egzaminator
    // Krótkie, siwiejące włosy z przedziałkiem
    ? '<path class="wlosy" fill="' + wlosy + '" d="M31 50c0-20 13-31 29-31s29 10 29 31c-4-9-12-14-22-15-9 3-20 4-30 2-3 4-5 8-6 13z"/>'
    // Bob z grzywką po jednej stronie
    : '<path class="wlosy" fill="' + wlosy + '" d="M27 62C23 32 39 16 60 16s37 16 33 46l-4 1c-1-15-6-25-17-30-8 6-22 9-36 9-2 6-3 13-4 20z"/>';

  var okulary = egzaminator
    ? '<g class="okulary" fill="none" stroke="#2a2f38" stroke-width="2.2"><rect x="38.5" y="49" width="17" height="13" rx="5"/>' +
      '<rect x="64.5" y="49" width="17" height="13" rx="5"/><path d="M55.5 55h9"/></g>'
    : "";

  // Każda twarz dostaje własny identyfikator przycięcia — dwie na jednej stronie
  // (np. w podglądzie) nie mogą dzielić jednego
  var klip = "klip-twarzy-" + (++rysunekTwarzy.licznik);

  return '<svg class="twarz' + (egzaminator ? " egzaminator" : "") + '" viewBox="0 0 120 120" aria-hidden="true">' +
    '<defs><clipPath id="' + klip + '"><circle cx="60" cy="60" r="58"/></clipPath></defs>' +
    '<circle cx="60" cy="60" r="58" class="tlo-twarzy"/>' +
    '<g clip-path="url(#' + klip + ')">' +
    // Tułów i szyja stoją w miejscu — rusza się tylko głowa
    '<path fill="' + sweter + '" d="M14 124c2-20 20-31 46-31s44 11 46 31z"/>' +
    '<path fill="' + skora + '" d="M51 80h18v14c-3 4-15 4-18 0z"/>' +
    '<g class="glowa">' +
      // Tył włosów (za głową)
      (egzaminator ? "" : '<path fill="' + wlosy + '" d="M28 60c0 18 4 30 10 34h44c6-4 10-16 10-34z"/>') +
      // Uszy i twarz
      '<ellipse cx="31" cy="58" rx="4.5" ry="7" fill="' + skora + '"/>' +
      '<ellipse cx="89" cy="58" rx="4.5" ry="7" fill="' + skora + '"/>' +
      '<ellipse cx="60" cy="56" rx="29" ry="33" fill="' + skora + '"/>' +
      fryzura +
      // Rumieńce — widoczne przy radości
      '<ellipse class="rumieniec" cx="44" cy="68" rx="6" ry="3.5" fill="#ff8a8a"/>' +
      '<ellipse class="rumieniec" cx="76" cy="68" rx="6" ry="3.5" fill="#ff8a8a"/>' +
      // Oczy: białko, źrenica z blaskiem, powieki do mrugania i mrużenia
      '<g class="oko oko-l"><ellipse cx="47" cy="56" rx="5.5" ry="6" fill="#fff"/>' +
        '<g class="zrenica"><circle cx="47" cy="56.5" r="3.2" fill="#2b1d14"/><circle cx="48.2" cy="55.2" r="1.1" fill="#fff"/></g>' +
        '<ellipse class="powieka" cx="47" cy="52" rx="7" ry="10" fill="' + skora + '"/>' +
        '<ellipse class="dolna-powieka" cx="47" cy="65" rx="7" ry="8" fill="' + skora + '"/></g>' +
      '<g class="oko oko-p"><ellipse cx="73" cy="56" rx="5.5" ry="6" fill="#fff"/>' +
        '<g class="zrenica"><circle cx="73" cy="56.5" r="3.2" fill="#2b1d14"/><circle cx="74.2" cy="55.2" r="1.1" fill="#fff"/></g>' +
        '<ellipse class="powieka" cx="73" cy="52" rx="7" ry="10" fill="' + skora + '"/>' +
        '<ellipse class="dolna-powieka" cx="73" cy="65" rx="7" ry="8" fill="' + skora + '"/></g>' +
      // Brwi rysujemy po oczach: zamknięta powieka nie może przykryć brwi przy mrugnięciu
      '<path class="brew brew-l" d="M40 44q7-4 14 0" stroke="' + wlosy + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path class="brew brew-p" d="M66 44q7-4 14 0" stroke="' + wlosy + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      okulary +
      // Nos
      '<path d="M60 58q-3 8 0 10" stroke="#c98f6d" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      // Usta: jedna mina na emocję, plus otwarte usta do mówienia
      '<g class="usta">' +
        '<path class="u u-neutralna" d="M52 75q8 5 16 0" stroke="#a4523f" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path class="u u-radosc" d="M49 73q11 13 22 0z" fill="#7a2e22" stroke="#a4523f" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<path class="u u-zaciekawienie" d="M53 75q7 4 14-1" stroke="#a4523f" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<ellipse class="u u-zdziwienie" cx="60" cy="77" rx="4" ry="5" fill="#7a2e22"/>' +
        '<path class="u u-troska" d="M53 77q7 -3 14 0" stroke="#a4523f" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path class="u u-rozbawienie" d="M48 72q12 15 24 0z" fill="#7a2e22" stroke="#a4523f" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<path class="u u-mysli" d="M54 76q5 -1 11 1" stroke="#a4523f" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<g class="u-mowa"><ellipse cx="60" cy="76" rx="7" ry="5" fill="#7a2e22"/>' +
          '<ellipse cx="60" cy="79" rx="4" ry="2" fill="#d9707a"/></g>' +
      "</g>" +
    "</g></g></svg>";
}
rysunekTwarzy.licznik = 0;

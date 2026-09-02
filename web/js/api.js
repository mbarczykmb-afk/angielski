/* ============================================================
   Komunikacja z Workerem
   ============================================================ */

var Api = {
  adres: localStorage.getItem("ai_adres") || "",
  token: localStorage.getItem("ai_token") || "",

  zapiszAdres: function (adres) {
    this.adres = String(adres || "").trim().replace(/\/+$/, "");
    localStorage.setItem("ai_adres", this.adres);
  },

  zapiszToken: function (token) {
    this.token = token || "";
    if (token) localStorage.setItem("ai_token", token);
    else localStorage.removeItem("ai_token");
  },

  /**
   * Jedno wywołanie API. Rzuca Error z czytelnym komunikatem po polsku —
   * warstwa UI nigdy nie musi zaglądać w kody HTTP.
   */
  wywolaj: async function (sciezka, opcje) {
    opcje = opcje || {};
    if (!this.adres) throw new Error("Nie ustawiono adresu serwera.");

    var naglowki = { "Content-Type": "application/json" };
    if (this.token) naglowki.Authorization = "Bearer " + this.token;

    var konfiguracja = { method: opcje.metoda || "GET", headers: naglowki };
    if (opcje.dane) {
      // Serwer liczy daty według strefy telefonu, więc dokładamy ją do każdego zapytania
      konfiguracja.body = JSON.stringify(Object.assign({ strefaMin: strefaMin() }, opcje.dane));
    }

    var odp;
    try {
      odp = await fetch(this.adres + sciezka, konfiguracja);
    } catch (e) {
      throw new Error(navigator.onLine
        ? "Nie mogę połączyć się z serwerem. Sprawdź adres w Ustawieniach."
        : "Brak połączenia z internetem.");
    }

    var tresc = null;
    try {
      tresc = await odp.json();
    } catch (e) {
      throw new Error("Serwer zwrócił nieczytelną odpowiedź (" + odp.status + ").");
    }

    if (!odp.ok) {
      if (odp.status === 401) {
        Api.zapiszToken("");
        throw new Error(tresc.blad || "Sesja wygasła. Zaloguj się ponownie.");
      }
      throw new Error(tresc.blad || "Błąd serwera (" + odp.status + ").");
    }

    return tresc;
  },

  pobierz: function (sciezka) {
    return this.wywolaj(sciezka + (sciezka.indexOf("?") > -1 ? "&" : "?") + "strefaMin=" + strefaMin());
  },

  wyslij: function (sciezka, dane) {
    return this.wywolaj(sciezka, { metoda: "POST", dane: dane || {} });
  },

  usun: function (sciezka) {
    return this.wywolaj(sciezka, { metoda: "DELETE" });
  },
};

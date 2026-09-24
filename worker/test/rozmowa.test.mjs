// Testy logiki rozmowy: odhaczanie celów lekcji i ranking domowy.
//
// Cele przychodzą z odpowiedzi modelu, a ta bywa niechlujna — liczby jako
// tekst, numery spoza zakresu, powtórzenia. To trafia prosto do interfejsu,
// więc serwer musi to uporządkować, zanim uczeń zobaczy dziwny stan.
import { scalCele, ranking } from "../src/nauka.js";

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano:  ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

// --- Cele lekcji ---

sprawdz("pierwszy cel zaliczony", scalCele([], [0], 3), [0]);
sprawdz("zaliczone wcześniej zostają, nawet gdy model o nich zapomni", scalCele([0, 1], [2], 3), [0, 1, 2]);
sprawdz("bez duplikatów", scalCele([1], [1, 1, 0], 3), [0, 1]);
sprawdz("numery jako tekst są przyjmowane", scalCele([], ["2", "0"], 3), [0, 2]);
sprawdz("numery spoza zakresu odrzucone", scalCele([], [3, -1, 7], 3), []);
sprawdz("ułamki i śmieci odrzucone", scalCele([], [1.5, "abc", {}], 3), []);
// Number(null) i Number("") dają 0 — to nie może odhaczać pierwszego celu
sprawdz("null nie zalicza pierwszego celu", scalCele([], [null], 3), []);
sprawdz("pusty napis nie zalicza pierwszego celu", scalCele([], ["", "  "], 3), []);
sprawdz("wartość logiczna nie jest numerem celu", scalCele([], [false, true], 3), []);
sprawdz("brak odpowiedzi modelu nie kasuje zaliczonych", scalCele([0], undefined, 3), [0]);
sprawdz("lekcja bez celów nic nie zalicza", scalCele([], [0, 1], 0), []);
sprawdz("wynik posortowany", scalCele([2], [0], 3), [0, 2]);

// --- Ranking domowy ---

// Najprostsza atrapa D1: rozpoznaje zapytanie po treści i oddaje gotowe wiersze
function atrapaBazy(uzytkownicy, postep) {
  return {
    prepare(sql) {
      const zapytanie = {
        _sql: sql,
        _parametry: [],
        bind(...p) { this._parametry = p; return this; },
        async all() {
          if (sql.includes("FROM users")) return { results: uzytkownicy };
          if (sql.includes("FROM progress")) {
            const od = this._parametry[0];
            const sumy = {};
            for (const r of postep) if (r.data >= od) sumy[r.user_id] = (sumy[r.user_id] || 0) + r.xp;
            return { results: Object.entries(sumy).map(([user_id, xp]) => ({ user_id, xp })) };
          }
          return { results: [] };
        },
      };
      return zapytanie;
    },
  };
}

const dzisTeraz = new Date().toISOString().slice(0, 10);
function dniTemu(n) {
  const d = new Date(dzisTeraz + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const env = {
  DB: atrapaBazy(
    [
      { id: "p", nazwa: "Piotr", streak: 6, ostatni_dzien: dzisTeraz, xp: 900 },
      { id: "m", nazwa: "Michał", streak: 4, ostatni_dzien: dniTemu(3), xp: 2000 },
      { id: "a", nazwa: "Ania", streak: 1, ostatni_dzien: dniTemu(1), xp: 50 },
    ],
    [
      { user_id: "p", data: dzisTeraz, xp: 60 },
      { user_id: "p", data: dniTemu(2), xp: 40 },
      { user_id: "m", data: dniTemu(10), xp: 500 }, // sprzed tygodnia — nie liczy się
      { user_id: "m", data: dniTemu(6), xp: 30 },   // szósty dzień wstecz — jeszcze się liczy
      { user_id: "a", data: dniTemu(1), xp: 70 },
    ]
  ),
};

const wynik = await ranking(env, { id: "m" }, 0);
sprawdz("kolejność po XP z ostatnich 7 dni, nie po sumie od początku",
  wynik.ranking.map((u) => u.nazwa), ["Piotr", "Ania", "Michał"]);
sprawdz("XP tygodnia policzone", wynik.ranking.map((u) => u.tydzien), [100, 70, 30]);
sprawdz("zalogowany oznaczony jako ja", wynik.ranking.find((u) => u.ja).nazwa, "Michał");
sprawdz("passa wygasa po przerwie dłuższej niż dzień", wynik.ranking.find((u) => u.nazwa === "Michał").streak, 0);
sprawdz("wczorajsza nauka podtrzymuje passę", wynik.ranking.find((u) => u.nazwa === "Ania").streak, 1);
sprawdz("tydzień zaczyna się 6 dni temu", wynik.odKiedy, dniTemu(6));
// Ranking nie może wyciekać identyfikatorów profili — tylko to, co widać na ekranie
sprawdz("bez identyfikatorów w odpowiedzi", Object.keys(wynik.ranking[0]).sort(), ["ja", "nazwa", "streak", "tydzien"]);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

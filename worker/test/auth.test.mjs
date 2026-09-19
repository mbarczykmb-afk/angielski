// Testy profili: porzadkowanie imienia i porownanie w stalym czasie.
//
// Imie profilu jest jednoczesnie jego etykieta i kluczem unikalnosci, wiec
// reguly musza znaczyc to samo przy zakladaniu konta i przy zmianie nazwy.
// Przemianowanie profilu nie moze tez otworzyc drogi do drugiego konta
// o tej samej nazwie, bo przy wyborze profilu nie dalo by sie ich odroznic.
import { normalizujNazwe, rowneStalyCzas } from "../src/auth.js";

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano:  ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

function odrzuca(nazwa, wartosc) {
  try {
    normalizujNazwe(wartosc);
    console.log(`✗ ${nazwa}\n   przeszlo, a mialo zostac odrzucone`);
    bledy++;
  } catch (e) {
    console.log(`✓ ${nazwa}`);
  }
}

// --- Porzadkowanie imienia ---

sprawdz("zwykle imie", normalizujNazwe("Piotr"), { nazwa: "Piotr", klucz: "piotr" });
sprawdz("spacje wokol przyciete", normalizujNazwe("  Piotr  "), { nazwa: "Piotr", klucz: "piotr" });
sprawdz("podwojne spacje w srodku scalone",
  normalizujNazwe("Piotr   K"), { nazwa: "Piotr K", klucz: "piotr k" });
sprawdz("polskie znaki zachowane",
  normalizujNazwe("Michał"), { nazwa: "Michał", klucz: "michał" });

// Klucz sluzy do wykrywania duplikatow, wiec wielkosc liter nie moze tworzyc
// dwoch osobnych profili, ktorych przy logowaniu nikt by nie rozroznil
sprawdz("klucz nie rozroznia wielkosci liter",
  normalizujNazwe("PIOTR").klucz, normalizujNazwe("piotr").klucz);
sprawdz("wyswietlana nazwa zachowuje wielkosc liter", normalizujNazwe("PIOTR").nazwa, "PIOTR");

// Tabulator i nowa linia tez sa bialymi znakami
sprawdz("tabulator traktowany jak spacja",
  normalizujNazwe("Piotr\tK"), { nazwa: "Piotr K", klucz: "piotr k" });

sprawdz("imie dluzsze niz 30 znakow przyciete",
  normalizujNazwe("A".repeat(50)).nazwa.length, 30);

// --- Odrzucane ---

odrzuca("puste imie", "");
odrzuca("same spacje", "     ");
odrzuca("jedna litera", "P");
odrzuca("jedna litera w spacjach", "  P  ");
odrzuca("brak wartosci", undefined);
odrzuca("null", null);

// --- Porownanie w stalym czasie ---

sprawdz("identyczne teksty", rowneStalyCzas("tajne123", "tajne123"), true);
sprawdz("rozne teksty", rowneStalyCzas("tajne123", "tajne124"), false);
sprawdz("rozna dlugosc", rowneStalyCzas("tajne", "tajne123"), false);
sprawdz("puste rowne pustemu", rowneStalyCzas("", ""), true);
sprawdz("puste kontra niepuste", rowneStalyCzas("", "x"), false);
sprawdz("roznica na pierwszym znaku", rowneStalyCzas("aaaa", "baaa"), false);
sprawdz("roznica na ostatnim znaku", rowneStalyCzas("aaaa", "aaab"), false);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

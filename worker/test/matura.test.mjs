// Testy logiki modułu "Matura ustna".
//
// Sprawdzamy to, co da się sprawdzić bez modelu i bez bazy: kolejność etapów
// egzaminu, zdania otwierające i liczenie tempa mowy, na którym opiera się
// ocena płynności.
import { nastepnyEtap, otwarcieEtapu, tempoMowy, OBSZARY } from "../src/matura.js";
import { nowaPassa } from "../src/pomoc.js";

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano:  ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

// --- Kolejność etapów ---

sprawdz("pełny egzamin: wstęp -> zadanie 1", nastepnyEtap("pelny", "wstep"), "z1");
sprawdz("pełny egzamin: zadanie 1 -> 2", nastepnyEtap("pelny", "z1"), "z2");
sprawdz("pełny egzamin: zadanie 2 -> 3", nastepnyEtap("pelny", "z2"), "z3");
sprawdz("pełny egzamin: po zadaniu 3 koniec", nastepnyEtap("pelny", "z3"), "koniec");

// Trening jednego zadania kończy się od razu — nie wpada w resztę egzaminu
sprawdz("trening zadania 1 kończy się po nim", nastepnyEtap("zadanie1", "z1"), "koniec");
sprawdz("trening zadania 2 kończy się po nim", nastepnyEtap("zadanie2", "z2"), "koniec");
sprawdz("trening zadania 3 kończy się po nim", nastepnyEtap("zadanie3", "z3"), "koniec");

// Etap spoza trybu nie może zapętlić egzaminu
sprawdz("etap spoza trybu prowadzi do końca", nastepnyEtap("zadanie2", "z1"), "koniec");
sprawdz("nieznany tryb traktujemy jak pełny", nastepnyEtap("bzdura", "wstep"), "z1");
sprawdz("nieznany etap prowadzi do końca", nastepnyEtap("pelny", "cokolwiek"), "koniec");

// --- Zdania otwierające ---

const zestaw = {
  rozmowaWstepna: ["How was your day?", "What are your plans?"],
  zadanie1: { pierwszaKwestia: "Hello, how can I help you today?" },
};

sprawdz("wstęp zaczyna się od pierwszego pytania rozgrzewkowego",
  otwarcieEtapu(zestaw, "wstep").includes("How was your day?"), true);
sprawdz("zadanie 1 otwiera kwestia z zestawu",
  otwarcieEtapu(zestaw, "z1"), "Hello, how can I help you today?");
sprawdz("pusty zestaw nie wywraca otwarcia",
  typeof otwarcieEtapu({}, "z1"), "string");
sprawdz("otwarcia są po angielsku — zadanie 2 zapowiada ilustrację",
  otwarcieEtapu(zestaw, "z2").includes("picture"), true);

// --- Tempo mowy ---

// Liczymy WYŁĄCZNIE zdającego. Kwestie egzaminatora wliczone do tempa
// zawyżałyby płynność tym bardziej, im więcej egzaminator mówił.
const przebieg = [
  { rola: "egzaminator", tresc: "Good morning and welcome to this exam today" },
  { rola: "zdajacy", tresc: "good morning thank you", sek: 6 },
  { rola: "egzaminator", tresc: "How are you?" },
  { rola: "zdajacy", tresc: "I am fine thank you very much", sek: 14 },
];

// 4 + 7 słów zdającego w 6 + 14 sekundach, czyli 33 słowa na minutę
sprawdz("tempo liczy tylko słowa zdającego",
  tempoMowy(przebieg), { slowa: 11, sekundy: 20, naMinute: 33 });

sprawdz("brak pomiarów czasu daje null",
  tempoMowy([{ rola: "zdajacy", tresc: "hello there", sek: 0 }]), null);
sprawdz("pusty przebieg daje null", tempoMowy([]), null);
sprawdz("brak przebiegu daje null", tempoMowy(undefined), null);

// Bardzo krótka próbka nie jest miarodajna — lepiej nic niż liczba z powietrza
sprawdz("wypowiedź poniżej 5 s nie daje tempa",
  tempoMowy([{ rola: "zdajacy", tresc: "yes", sek: 3 }]), null);

// --- Zakres tematyczny ---

sprawdz("zakres tematyczny ma 15 obszarów", OBSZARY.length, 15);
sprawdz("obszary są unikatowe", new Set(OBSZARY).size, OBSZARY.length);

// --- Passa wspólna dla kursu i matury ---

sprawdz("passa rośnie dzień po dniu", nowaPassa("2026-09-17", "2026-09-18", 4), 5);
sprawdz("druga sesja tego samego dnia nie podbija passy", nowaPassa("2026-09-18", "2026-09-18", 4), 4);
sprawdz("przerwa resetuje passę", nowaPassa("2026-09-15", "2026-09-18", 9), 1);
sprawdz("pierwsza sesja w życiu daje passę 1", nowaPassa("", "2026-09-18", 0), 1);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);

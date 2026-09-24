// ============================================================
// Matura ustna z języka angielskiego — moduł egzaminacyjny
//
// Odwzorowuje przebieg części ustnej egzaminu maturalnego (Formuła 2023):
//   rozmowa wstępna  — kilka pytań o zdającego, nieoceniane osobno,
//   zadanie 1        — rozmowa z odgrywaniem roli, cztery elementy z polecenia,
//   zadanie 2        — opis ilustracji i trzy pytania egzaminującego,
//   zadanie 3        — materiał stymulujący: wybór z uzasadnieniem i dwa pytania.
//
// Ocena według kryteriów CKE: sprawność komunikacyjna po 6 pkt za każde
// z trzech zadań (18), zakres struktur leksykalno-gramatycznych 4,
// poprawność 4, wymowa 2, płynność 2 — razem 30 pkt. Próg zdania to 30%.
//
// Egzaminator w trakcie egzaminu NIE poprawia i nie podpowiada — tak samo jak
// prawdziwy. Cała informacja zwrotna przychodzi dopiero po zakończeniu.
// ============================================================
import { BladApi, uuid, dzisISO, terazISO, dataPlus, bezpieczneJson, tekst, liczba, nowaPassa } from "./pomoc.js";
import { wywolajAIJson, MODEL_GLOWNY, MODEL_ROZMOWA, DOSTAWCA_GEMINI } from "./ai.js";
import { znajdzZdjecie } from "./zdjecia.js";
import { zapiszKopie } from "./kopie.js";

// Zakres tematyczny wymagań egzaminacyjnych — z tego losujemy zestaw
export const OBSZARY = [
  "Człowiek",
  "Miejsce zamieszkania",
  "Edukacja",
  "Praca",
  "Życie prywatne",
  "Żywienie",
  "Zakupy i usługi",
  "Podróżowanie i turystyka",
  "Kultura",
  "Sport",
  "Zdrowie",
  "Nauka i technika",
  "Świat przyrody",
  "Państwo i społeczeństwo",
  "Życie społeczne",
];

// Kolejność etapów w każdym trybie. Trening pojedynczego zadania pomija resztę.
const ETAPY = {
  pelny: ["wstep", "z1", "z2", "z3"],
  zadanie1: ["z1"],
  zadanie2: ["z2"],
  zadanie3: ["z3"],
};

// Maksimum punktów: pełny egzamin to trzy zadania po 6 pkt sprawności plus
// 12 pkt kryteriów wspólnych. Trening jednego zadania — 6 plus te same 12.
const MAKS = { pelny: 30, zadanie1: 18, zadanie2: 18, zadanie3: 18 };

const NAZWY_TRYBOW = {
  pelny: "Pełny egzamin",
  zadanie1: "Zadanie 1 — rozmowa z odgrywaniem roli",
  zadanie2: "Zadanie 2 — opis ilustracji",
  zadanie3: "Zadanie 3 — materiał stymulujący",
};

function trybPoprawny(tryb) {
  return ETAPY[tryb] ? tryb : "pelny";
}

function nazwaTrybu(tryb) {
  return NAZWY_TRYBOW[tryb] || NAZWY_TRYBOW.pelny;
}

export function nastepnyEtap(tryb, etap) {
  const lista = ETAPY[trybPoprawny(tryb)];
  const gdzie = lista.indexOf(etap);
  if (gdzie < 0) return "koniec";
  return lista[gdzie + 1] || "koniec";
}

// Zdania otwierające poszczególne etapy. Trzymamy je w kodzie, bo są stałe
// i nie ma powodu płacić za ich generowanie przy każdym zestawie.
export function otwarcieEtapu(zestaw, etap) {
  if (etap === "wstep") {
    const pierwsze = (zestaw.rozmowaWstepna || [])[0] || "How are you today?";
    return "Good morning. Before we start the tasks, I'd like to ask you a few questions. " + pierwsze;
  }
  if (etap === "z1") {
    return zestaw.zadanie1?.pierwszaKwestia || "Let's begin. What can I do for you?";
  }
  if (etap === "z2") {
    return "Now let's move on to task two. Please look at the picture and describe it.";
  }
  if (etap === "z3") {
    return "Now task three. Please look at the material, choose one option and say why you chose it.";
  }
  return "Thank you. That's the end of the exam.";
}

// Wybór modelu dla tur egzaminu — ten sam, co w zwykłej rozmowie.
// Ocena końcowa idzie zawsze przez Opusa, bo robi się ją raz.
function modelTury(uzytkownik) {
  const ustawienia = bezpieczneJson(uzytkownik.ustawienia, {});
  const wybor = ustawienia.modelRozmowy;
  if (wybor === "opus") return { model: MODEL_GLOWNY, effort: "low" };
  if (wybor === "gemini") return { dostawca: DOSTAWCA_GEMINI };
  return { model: MODEL_ROZMOWA };
}

// ============================================================
// TABELA — zakładana sama przy pierwszym użyciu
//
// Moduł dochodzi do działającej aplikacji, a jej właściciel aktualizuje ją
// z telefonu: kod jedzie z GitHuba, ale migracji bazy nie ma jak odpalić.
// Dlatego tabela powstaje przy pierwszym wejściu w moduł. Plik
// migracje/002-matura.sql zostaje dla tych, którzy wolą zrobić to ręcznie.
// ============================================================

let tabelaGotowa = false;

async function upewnijSieOTabele(env) {
  if (tabelaGotowa) return;

  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS matura (
         id        TEXT PRIMARY KEY,
         user_id   TEXT NOT NULL,
         data      TEXT NOT NULL,
         tryb      TEXT NOT NULL DEFAULT 'pelny',
         temat     TEXT NOT NULL DEFAULT '',
         obszar    TEXT NOT NULL DEFAULT '',
         zestaw    TEXT NOT NULL DEFAULT '{}',
         przebieg  TEXT NOT NULL DEFAULT '[]',
         punkty    INTEGER NOT NULL DEFAULT 0,
         maks      INTEGER NOT NULL DEFAULT 30,
         szczegoly TEXT NOT NULL DEFAULT '',
         czas_sek  INTEGER NOT NULL DEFAULT 0,
         status    TEXT NOT NULL DEFAULT 'w-toku',
         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
       )`
    ),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_matura_user ON matura(user_id, data)"),
  ]);

  tabelaGotowa = true;
}

// ============================================================
// STAN MODUŁU — historia podejść i to, co z niej wynika
// ============================================================

export async function pobierzStanMatury(env, uzytkownik) {
  await upewnijSieOTabele(env);

  const { results } = await env.DB.prepare(
    `SELECT id, data, tryb, temat, obszar, punkty, maks, czas_sek, status
       FROM matura WHERE user_id = ? ORDER BY rowid DESC LIMIT 40`
  )
    .bind(uzytkownik.id)
    .all();

  const podejscia = (results || []).map((p) => ({
    id: p.id,
    data: p.data,
    tryb: p.tryb,
    trybNazwa: NAZWY_TRYBOW[p.tryb] || p.tryb,
    temat: p.temat,
    obszar: p.obszar,
    punkty: liczba(p.punkty),
    maks: liczba(p.maks, 30),
    procent: liczba(p.maks, 30) ? Math.round((liczba(p.punkty) / liczba(p.maks, 30)) * 100) : 0,
    czasSek: liczba(p.czas_sek),
    status: p.status,
  }));

  const ocenione = podejscia.filter((p) => p.status === "zakonczony");
  const pelne = ocenione.filter((p) => p.tryb === "pelny");

  // Wskazówki bierzemy z ostatniej ocenionej próby — świeże i konkretne
  let doPoprawy = [];
  if (ocenione.length) {
    const ostatnie = await env.DB.prepare("SELECT szczegoly FROM matura WHERE id = ? AND user_id = ?")
      .bind(ocenione[0].id, uzytkownik.id)
      .first();
    doPoprawy = bezpieczneJson(ostatnie?.szczegoly, {})?.doPoprawy || [];
  }

  return {
    podejscia,
    obszary: OBSZARY,
    podejscPelnych: pelne.length,
    najlepszy: pelne.length ? Math.max(...pelne.map((p) => p.punkty)) : 0,
    srednia: ocenione.length
      ? Math.round(ocenione.reduce((a, p) => a + p.procent, 0) / ocenione.length)
      : 0,
    doPoprawy: Array.isArray(doPoprawy) ? doPoprawy.slice(0, 5) : [],
  };
}

export async function pobierzPodejscie(env, uzytkownik, id) {
  const wiersz = await env.DB.prepare("SELECT * FROM matura WHERE id = ? AND user_id = ?")
    .bind(tekst(id, 64), uzytkownik.id)
    .first();
  if (!wiersz) throw new BladApi(404, "Nie znaleziono tego podejścia.");

  return {
    id: wiersz.id,
    data: wiersz.data,
    tryb: wiersz.tryb,
    trybNazwa: NAZWY_TRYBOW[wiersz.tryb] || wiersz.tryb,
    temat: wiersz.temat,
    obszar: wiersz.obszar,
    zestaw: bezpieczneJson(wiersz.zestaw, {}),
    przebieg: bezpieczneJson(wiersz.przebieg, []),
    punkty: liczba(wiersz.punkty),
    maks: liczba(wiersz.maks, 30),
    ocena: bezpieczneJson(wiersz.szczegoly, null),
    status: wiersz.status,
  };
}

// ============================================================
// ZESTAW EGZAMINACYJNY
// ============================================================

function opisZadan(tryb) {
  const czesci = [];

  if (tryb === "pelny") {
    czesci.push(
      '"rozmowaWstepna": 3 pytania PO ANGIELSKU o samego zdającego (dzień, plany, zainteresowania) — ' +
        "krótkie, takie, jakie egzaminator zadaje na rozgrzewkę."
    );
  }

  if (tryb === "pelny" || tryb === "zadanie1") {
    czesci.push(
      '"zadanie1" — rozmowa z odgrywaniem roli:\n' +
        '  "polecenie": PO POLSKU, tak jak na karcie egzaminacyjnej: jedno zdanie o sytuacji ' +
        "i kim jest rozmówca (np. „Jesteś w hotelu w Londynie. Rozmawiasz z recepcjonistą.”).\n" +
        '  "elementy": DOKŁADNIE 4 elementy PO POLSKU, każdy to jedna rzecz do omówienia ' +
        "(np. „powód Twojego niezadowolenia”, „proponowane rozwiązanie”). Bez podpowiedzi po angielsku.\n" +
        '  "rolaEgzaminatora": PO ANGIELSKU, jednym zdaniem, w kogo wciela się egzaminator ' +
        "(to MĘŻCZYZNA — zdający widzi męską twarz egzaminatora; imię, jeśli jest, męskie).\n" +
        '  "pierwszaKwestia": PO ANGIELSKU, pierwsze zdanie rozmówcy, zakończone pytaniem.'
    );
  }

  if (tryb === "pelny" || tryb === "zadanie2") {
    czesci.push(
      '"zadanie2" — opis ilustracji:\n' +
        '  "polecenie": PO POLSKU, standardowa formuła CKE.\n' +
        '  "hasla": 2-4 słowa PO ANGIELSKU, którymi da się znaleźć w banku zdjęć fotografię ' +
        'do tego zadania (np. ["family", "dinner", "kitchen"]). Konkretne rzeczowniki i czynności, ' +
        "bez przymiotników oceniających i bez nazw własnych.\n" +
        '  "ilustracja": PO POLSKU, 4-6 zdań opisujących scenę tak dokładnie, jak wyglądałoby zdjęcie: ' +
        "kto, gdzie, co robi, co jest w tle, jaki nastrój. Używamy tego, gdy nie uda się znaleźć zdjęcia. " +
        "Nie podawaj angielskich słów.\n" +
        '  "pytania": 3 pytania PO ANGIELSKU. Zdający będzie oglądał PRAWDZIWE zdjęcie, którego Ty nie ' +
        "widzisz, więc pytania muszą działać dla każdej fotografii z tego tematu: pierwsze ogólne o samą " +
        'scenę (np. "How do you think the people in the picture feel?"), dwa kolejne o doświadczenia ' +
        "i opinie zdającego. Żadnych pytań o szczegóły, których możesz nie trafić."
    );
  }

  if (tryb === "pelny" || tryb === "zadanie3") {
    czesci.push(
      '"zadanie3" — materiał stymulujący:\n' +
        '  "polecenie": PO POLSKU, standardowa formuła CKE: wybór jednej z dwóch propozycji, ' +
        "uzasadnienie wyboru i wyjaśnienie, dlaczego odrzuca się drugą.\n" +
        '  "kontekst": PO POLSKU, jedno zdanie o sytuacji.\n' +
        '  "opcje": DOKŁADNIE 2 pozycje, każda {"etykieta":"A"/"B","opis":"2-3 zdania PO POLSKU"}.\n' +
        '  "pytania": 2 pytania PO ANGIELSKU rozwijające temat, wymagające dłuższej wypowiedzi.'
    );
  }

  return czesci.join("\n\n");
}

export async function nowyZestaw(env, uzytkownik, dane) {
  await upewnijSieOTabele(env);

  const tryb = trybPoprawny(tekst(dane.tryb, 20));
  const wybranyObszar = tekst(dane.obszar, 60).trim();
  const obszar = OBSZARY.includes(wybranyObszar)
    ? wybranyObszar
    : OBSZARY[Math.floor(Math.random() * OBSZARY.length)];
  const strefaMin = liczba(dane.strefaMin);

  const system =
    "Układasz zestaw do części ustnej egzaminu maturalnego z języka angielskiego w Polsce " +
    "(Formuła 2023, egzamin wspólny dla poziomu podstawowego i rozszerzonego).\n\n" +
    `Zakres tematyczny tego zestawu: ${obszar}.\n\n` +
    "Trzymaj się realiów egzaminu:\n" +
    "- polecenia i materiały dla zdającego są PO POLSKU, wypowiedzi egzaminatora PO ANGIELSKU,\n" +
    "- poziom językowy odpowiada B1/B2 — to nie ma być ani banał, ani zadanie dla filologa,\n" +
    "- sytuacje mają być z życia: realne, konkretne, osadzone w codzienności nastolatka lub " +
    "młodego dorosłego, nie abstrakcyjne rozważania,\n" +
    "- wszystko, co egzaminator wypowiada, pisz tak, żeby dobrze brzmiało czytane na głos: " +
    "krótkie zdania, naturalna mowa, formy ściągnięte. Bez wypunktowań, nawiasów i emoji.\n\n" +
    "Przygotuj:\n\n" +
    opisZadan(tryb) +
    "\n\nDodatkowo:\n" +
    '"temat": etykieta zestawu PO POLSKU, do 50 znaków.\n\n' +
    "Odpowiedz WYŁĄCZNIE poprawnym JSON-em z polami, o które proszę powyżej, plus \"temat\".";

  const zestaw = await wywolajAIJson(
    env,
    [{ role: "user", content: `Ułóż zestaw egzaminacyjny. Tryb: ${nazwaTrybu(tryb)}.` }],
    { system, model: MODEL_GLOWNY, maxTokens: 4000, effort: "medium" },
    null
  );

  // Zestaw bez zadania, o które prosiliśmy, jest bezużyteczny — lepiej odrzucić
  // go tutaj niż wpuścić ucznia na egzamin z pustą kartą
  const wymagane = tryb === "pelny" ? ["zadanie1", "zadanie2", "zadanie3"] : [tryb];
  if (!zestaw || wymagane.some((k) => !zestaw[k])) {
    throw new BladApi(502, "Nie udało się ułożyć zestawu. Spróbuj jeszcze raz.");
  }

  // Prawdziwa fotografia zamiast opisu sceny — na maturze zdający dostaje
  // zdjęcie. Gdy nie da się żadnego dobrać, zostaje opis i egzamin idzie dalej.
  if (zestaw.zadanie2) {
    zestaw.zadanie2.zdjecie = await znajdzZdjecie(env, zestaw.zadanie2.hasla);
  }

  const etap = ETAPY[tryb][0];
  const otwarcie = otwarcieEtapu(zestaw, etap);
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO matura (id, user_id, data, tryb, temat, obszar, zestaw, przebieg, punkty, maks, szczegoly, czas_sek, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', 0, 'w-toku')`
  )
    .bind(
      id,
      uzytkownik.id,
      terazISO(strefaMin),
      tryb,
      tekst(zestaw.temat, 100),
      obszar,
      JSON.stringify(zestaw).slice(0, 20000),
      JSON.stringify([{ rola: "egzaminator", etap, tresc: otwarcie }]),
      MAKS[tryb]
    )
    .run();

  return {
    sesjaId: id,
    tryb,
    trybNazwa: nazwaTrybu(tryb),
    obszar,
    zestaw,
    etap,
    maks: MAKS[tryb],
    odpowiedz: otwarcie,
  };
}

// ============================================================
// TURA EGZAMINU
// ============================================================

function instrukcjaEtapu(zestaw, etap) {
  if (etap === "wstep") {
    return (
      "ETAP: rozmowa wstępna. Zadaj po kolei te pytania, po jednym na turę:\n" +
      (zestaw.rozmowaWstepna || []).map((p, i) => `${i + 1}. ${p}`).join("\n") +
      "\nGdy zdający odpowie na ostatnie z nich, zamknij rozmowę wstępną jednym zdaniem " +
      "i przeczytaj pierwszą kwestię zadania 1."
    );
  }

  if (etap === "z1") {
    const z = zestaw.zadanie1 || {};
    return (
      "ETAP: zadanie 1 — rozmowa z odgrywaniem roli.\n" +
      `TWOJA ROLA: ${z.rolaEgzaminatora || "rozmówca w opisanej sytuacji"}\n` +
      `SYTUACJA: ${z.polecenie || ""}\n` +
      "ELEMENTY, które zdający ma omówić (widzi je po polsku na karcie):\n" +
      (z.elementy || []).map((e, i) => `${i + 1}. ${e}`).join("\n") +
      "\nProwadź rozmowę w roli. Jeśli zdający pominął któryś element albo zbył go jednym słowem, " +
      "naprowadź go pytaniem w roli — nie wymieniaj elementów wprost i nie mów po polsku. " +
      "Gdy wszystkie cztery elementy zostały poruszone i rozwinięte, zakończ rozmowę w roli."
    );
  }

  if (etap === "z2") {
    const z = zestaw.zadanie2 || {};
    return (
      "ETAP: zadanie 2 — opis ilustracji i trzy pytania.\n" +
      (z.zdjecie
        ? "ZDJĘCIE: zdający ogląda prawdziwą fotografię na temat: " +
          (z.hasla || []).join(", ") +
          ". TY JEJ NIE WIDZISZ. Nigdy nie twierdź, co na niej jest, i nie poprawiaj " +
          "zdającego, gdy opisuje coś innego, niż się spodziewasz — to on patrzy na zdjęcie, nie Ty. " +
          "Zadawaj wyłącznie pytania z listy poniżej.\n"
        : "ILUSTRACJA (zdający ma jej opis przed sobą): " + (z.ilustracja || "") + "\n") +
      "PYTANIA, które zadajesz po opisie, pojedynczo i w tej kolejności:\n" +
      (z.pytania || []).map((p, i) => `${i + 1}. ${p}`).join("\n") +
      "\nNajpierw poczekaj na opis ilustracji. Jeśli opis jest bardzo ubogi, poproś raz " +
      'o rozwinięcie ("Could you tell me more about what you can see?"), a potem przejdź do pytań. ' +
      "Po odpowiedzi na trzecie pytanie zakończ zadanie."
    );
  }

  if (etap === "z3") {
    const z = zestaw.zadanie3 || {};
    return (
      "ETAP: zadanie 3 — materiał stymulujący.\n" +
      `KONTEKST: ${z.kontekst || ""}\n` +
      "OPCJE DO WYBORU:\n" +
      (z.opcje || []).map((o) => `${o.etykieta}: ${o.opis}`).join("\n") +
      "\nPYTANIA po wyborze, pojedynczo i w tej kolejności:\n" +
      (z.pytania || []).map((p, i) => `${i + 1}. ${p}`).join("\n") +
      "\nNajpierw zdający wybiera jedną opcję, uzasadnia wybór i mówi, dlaczego odrzuca drugą. " +
      "Jeśli pominął uzasadnienie odrzucenia, dopytaj raz. Potem zadaj oba pytania. " +
      "Po odpowiedzi na drugie pytanie zakończ egzamin."
    );
  }

  return "ETAP: koniec. Podziękuj jednym zdaniem i nie zadawaj już pytań.";
}

export async function turaMatury(env, uzytkownik, dane) {
  const sesjaId = tekst(dane.sesjaId, 64);
  const wiadomosc = tekst(dane.wiadomosc, 2000).trim();
  const wymusDalej = !!dane.wymusDalej;

  if (!wiadomosc && !wymusDalej) throw new BladApi(400, "Pusta wypowiedź.");

  const wiersz = await env.DB.prepare("SELECT * FROM matura WHERE id = ? AND user_id = ?")
    .bind(sesjaId, uzytkownik.id)
    .first();
  if (!wiersz) throw new BladApi(404, "Nie znaleziono tego egzaminu.");
  if (wiersz.status !== "w-toku") throw new BladApi(400, "Ten egzamin jest już zakończony.");

  const tryb = trybPoprawny(wiersz.tryb);
  const zestaw = bezpieczneJson(wiersz.zestaw, {});
  const przebieg = bezpieczneJson(wiersz.przebieg, []);
  // Etap przychodzi od przeglądarki, więc bierzemy tylko taki, który w tym
  // trybie w ogóle istnieje — inaczej dałoby się przeskoczyć zadanie
  const zadany = tekst(dane.etap, 10);
  const etap = ETAPY[tryb].includes(zadany) ? zadany : ETAPY[tryb][0];
  const kolejny = nastepnyEtap(tryb, etap);

  const system =
    "Jesteś egzaminatorem na części ustnej egzaminu maturalnego z języka angielskiego w Polsce. " +
    "Prowadzisz egzamin ze zdającym. Zdający widzi na ekranie Twoją twarz — mężczyzny " +
    "(androida o imieniu Unit X); w odgrywanych rolach też jesteś mężczyzną.\n\n" +
    "JAK SIĘ ZACHOWUJESZ:\n" +
    "1. Mówisz WYŁĄCZNIE po angielsku, naturalnie i spokojnie. Maksymalnie 2 zdania na turę — " +
    "to zdający ma mówić, nie Ty.\n" +
    "2. NIE poprawiasz błędów, NIE tłumaczysz gramatyki, NIE podpowiadasz słówek. Prawdziwy " +
    "egzaminator tego nie robi, a zdający musi poznać ten poziom trudności przed egzaminem.\n" +
    "3. Nie chwalisz wylewnie. Krótkie „Thank you”, „I see”, „All right” — tyle wystarczy.\n" +
    "4. Nie zdradzasz oceny ani tego, jak Ci idzie. Ocena przychodzi po egzaminie.\n" +
    "5. Piszesz tak, jak się mówi: formy ściągnięte, żadnych wypunktowań, nawiasów ani emoji. " +
    "Twoja odpowiedź jest czytana na głos.\n" +
    "6. Zdający mówi do mikrofonu, więc dostajesz zapis rozpoznanej mowy — bez interpunkcji " +
    "i czasem z przekręconym słowem. Domyślaj się sensu i nie komentuj tego.\n" +
    "7. Jeśli zdający odezwie się po polsku albo poprosi o powtórzenie, powtórz swoje zdanie " +
    "wolniej i prościej po angielsku. Nie tłumacz na polski.\n\n" +
    instrukcjaEtapu(zestaw, etap) +
    "\n\nPRZECHODZENIE DALEJ:\n" +
    `Dopóki ten etap trwa, zwracaj "etap": "${etap}".\n` +
    (kolejny === "koniec"
      ? 'Gdy etap jest zamknięty, zwróć "etap": "koniec", a w "odpowiedz" podziękuj jednym zdaniem ' +
        "i zakończ egzamin. Nie zadawaj już wtedy pytania.\n"
      : `Gdy ten etap jest zamknięty, zwróć "etap": "${kolejny}", a w "odpowiedz" ` +
        "napisz jedno zdanie zamykające ten etap i od razu otwórz następny:\n" +
        `"${otwarcieEtapu(zestaw, kolejny)}"\n` +
        "Możesz to sformułować własnymi słowami, ale sens ma być ten sam.\n") +
    (wymusDalej
      ? "\nUWAGA: zdający poprosił o przejście dalej. Zamknij ten etap TERAZ, niezależnie od tego, " +
        "ile zostało omówione.\n"
      : "") +
    "\nOdpowiedz WYŁĄCZNIE poprawnym JSON-em:\n" +
    `{"odpowiedz":"...","etap":"${etap}"}`;

  // Ostatnie 10 wymian wystarcza na kontekst etapu i trzyma koszt w ryzach
  const wiadomosci = przebieg
    .slice(-20)
    .filter((w) => w && w.tresc)
    .map((w) => ({
      role: w.rola === "egzaminator" ? "assistant" : "user",
      content: tekst(w.tresc, 2000),
    }));
  wiadomosci.push({
    role: "user",
    content: wiadomosc || "[zdający prosi o przejście do następnej części]",
  });

  const odp = await wywolajAIJson(env, wiadomosci, { system, maxTokens: 600, ...modelTury(uzytkownik) }, {
    odpowiedz: "Sorry, could you say that again, please?",
    etap,
  });

  const nowyEtap = [etap, kolejny, "koniec"].includes(odp.etap) ? odp.etap : etap;
  const odpowiedz = tekst(odp.odpowiedz, 2000) || "Thank you. Could you say a little more?";

  if (wiadomosc) {
    przebieg.push({ rola: "zdajacy", etap, tresc: wiadomosc, sek: liczba(dane.sek) });
  }
  przebieg.push({ rola: "egzaminator", etap: nowyEtap, tresc: odpowiedz });

  await env.DB.prepare("UPDATE matura SET przebieg = ? WHERE id = ?")
    .bind(JSON.stringify(przebieg.slice(-200)).slice(0, 60000), sesjaId)
    .run();

  return { odpowiedz, etap: nowyEtap };
}

// ============================================================
// OCENA WEDŁUG KRYTERIÓW CKE
// ============================================================

// Punkty od modelu przycinamy do widełek kryterium — arytmetykę robimy sami,
// bo na sumie z modelu nie można polegać, a to jest wynik egzaminu.
function przytnij(wartosc, maks) {
  return Math.max(0, Math.min(maks, Math.round(liczba(wartosc))));
}

// Tempo mowy liczymy z faktycznych czasów wypowiedzi — jedyna rzecz w płynności,
// którą da się zmierzyć, a nie tylko oszacować z zapisu.
export function tempoMowy(przebieg) {
  let slowa = 0;
  let sekundy = 0;

  for (const w of przebieg || []) {
    if (!w || w.rola !== "zdajacy") continue;
    slowa += String(w.tresc || "").split(/\s+/).filter(Boolean).length;
    sekundy += liczba(w.sek);
  }

  if (!slowa || sekundy < 5) return null;
  return { slowa, sekundy: Math.round(sekundy), naMinute: Math.round((slowa / sekundy) * 60) };
}

export async function ocenMature(env, uzytkownik, sesjaId, dane) {
  const strefaMin = liczba(dane.strefaMin);
  const dzis = dzisISO(strefaMin);

  const wiersz = await env.DB.prepare("SELECT * FROM matura WHERE id = ? AND user_id = ?")
    .bind(tekst(sesjaId, 64), uzytkownik.id)
    .first();
  if (!wiersz) throw new BladApi(404, "Nie znaleziono tego egzaminu.");
  if (wiersz.status === "zakonczony") throw new BladApi(400, "To podejście jest już ocenione.");

  const tryb = trybPoprawny(wiersz.tryb);
  const zestaw = bezpieczneJson(wiersz.zestaw, {});
  const przebieg = bezpieczneJson(wiersz.przebieg, []);
  const wypowiedzi = przebieg.filter((w) => w.rola === "zdajacy");

  if (!wypowiedzi.length) throw new BladApi(400, "Nie ma czego oceniać — zdający nic nie powiedział.");

  const zadania = tryb === "pelny" ? [1, 2, 3] : [Number(tryb.replace("zadanie", "")) || 1];
  const tempo = tempoMowy(przebieg);

  const system =
    "Jesteś egzaminatorem Okręgowej Komisji Egzaminacyjnej. Oceniasz część ustną egzaminu " +
    "maturalnego z języka angielskiego według oficjalnych kryteriów.\n\n" +
    "KRYTERIA I WIDEŁKI PUNKTOWE:\n\n" +
    "1. SPRAWNOŚĆ KOMUNIKACYJNA — osobno dla każdego zadania, 0-6 pkt.\n" +
    "Liczy się, do ilu elementów z polecenia zdający się odniósł i ile z nich rozwinął " +
    "w zadowalającym stopniu. 6 pkt: wszystkie elementy omówione i rozwinięte. " +
    "3 pkt: część elementów pominięta albo potraktowana jednym zdaniem. " +
    "0 pkt: wypowiedź nie na temat albo nie ma jej wcale. " +
    "Bierz też pod uwagę, czy zdający sam podtrzymywał rozmowę, czy trzeba go było ciągnąć za język.\n\n" +
    "2. ZAKRES STRUKTUR LEKSYKALNO-GRAMATYCZNYCH — 0-4 pkt za cały egzamin.\n" +
    "4 pkt: zróżnicowane słownictwo i struktury, swobodne parafrazy. " +
    "2 pkt: podstawowy, powtarzalny zasób, wystarczający do przekazania treści. " +
    "0 pkt: zasób tak ubogi, że blokuje komunikację.\n\n" +
    "3. POPRAWNOŚĆ STRUKTUR LEKSYKALNO-GRAMATYCZNYCH — 0-4 pkt za cały egzamin.\n" +
    "4 pkt: sporadyczne błędy, nie zaburzają komunikacji. " +
    "2 pkt: liczne błędy, ale sens pozostaje jasny. " +
    "0 pkt: błędy uniemożliwiają zrozumienie.\n\n" +
    "4. WYMOWA — 0-2 pkt.\n" +
    "5. PŁYNNOŚĆ WYPOWIEDZI — 0-2 pkt.\n\n" +
    "BARDZO WAŻNE OGRANICZENIE:\n" +
    "Nie słyszysz nagrania. Dostajesz zapis z automatycznego rozpoznawania mowy. " +
    "Dlatego wymowę i płynność oceniasz SZACUNKOWO i musisz to napisać wprost " +
    "w uzasadnieniu. Przesłanki, jakimi dysponujesz: jak spójny i sensowny jest zapis " +
    "(mocno przekręcone słowa zwykle znaczą niewyraźną wymowę), długość wypowiedzi " +
    "i podane niżej tempo mowy. Przy braku przesłanek nie zaniżaj — daj wynik średni " +
    "i powiedz, że to oszacowanie.\n" +
    "Zapis nie ma interpunkcji. NIE traktuj tego jako błędu — to sposób zapisu, nie mowa zdającego.\n" +
    (zestaw.zadanie2?.zdjecie
      ? "W zadaniu 2 zdający opisywał prawdziwą fotografię, której TY NIE WIDZISZ. Nie oceniaj więc " +
        "zgodności opisu ze zdjęciem — oceniaj język i to, czy opis był pełny, uporządkowany " +
        "i rozwinięty. Zakładaj, że to, co zdający opisał, faktycznie było na zdjęciu.\n"
      : "") +
    "\n" +
    "POZA PUNKTAMI podaj to, co naprawdę pomaga się poprawić:\n" +
    '"bledy": 3-8 konkretnych potknięć. Dla każdego "bylo" (cytat ze zdającego), ' +
    '"powinno" (poprawna wersja po angielsku) i "dlaczego" (krótkie wyjaśnienie po polsku — ' +
    "reguła albo powód, nie ogólnik). Pomijaj usterki rozpoznawania mowy.\n" +
    '"zwroty": 4-6 zwrotów egzaminacyjnych, których zdającemu wyraźnie zabrakło ' +
    '(np. do opisu ilustracji, do uzasadniania wyboru), z polskim tłumaczeniem i polem "kiedy" ' +
    "mówiącym po polsku, w którym momencie egzaminu ich użyć.\n" +
    '"doPoprawy": 2-4 wnioski po polsku — nad czym pracować przed prawdziwym egzaminem.\n' +
    '"komentarz": 3-4 zdania po polsku, rzeczowo i bez owijania w bawełnę.\n\n' +
    "Odpowiedz WYŁĄCZNIE poprawnym JSON-em:\n" +
    '{"sprawnosc":[{"zadanie":1,"punkty":0,"uzasadnienie":"po polsku"}],' +
    '"zakres":{"punkty":0,"uzasadnienie":""},"poprawnosc":{"punkty":0,"uzasadnienie":""},' +
    '"wymowa":{"punkty":0,"uzasadnienie":""},"plynnosc":{"punkty":0,"uzasadnienie":""},' +
    '"bledy":[{"bylo":"","powinno":"","dlaczego":""}],"mocne":["po polsku"],' +
    '"doPoprawy":["po polsku"],"zwroty":[{"en":"","pl":"","kiedy":""}],"komentarz":""}\n' +
    `Tablica "sprawnosc" ma mieć dokładnie ${zadania.length} ` +
    `pozycji, dla ${zadania.length === 1 ? "zadania " + zadania[0] : "zadań 1, 2 i 3"}.`;

  const transkrypcja = przebieg
    .map((w) => (w.rola === "egzaminator" ? "EGZAMINATOR: " : "ZDAJĄCY: ") + tekst(w.tresc, 1000))
    .join("\n");

  const ocena = await wywolajAIJson(
    env,
    [
      {
        role: "user",
        content:
          `ZESTAW EGZAMINACYJNY:\n${JSON.stringify(zestaw).slice(0, 8000)}\n\n` +
          `PRZEBIEG EGZAMINU:\n${transkrypcja.slice(0, 20000)}\n\n` +
          (tempo
            ? `TEMPO MOWY ZDAJĄCEGO: ${tempo.slowa} słów w ${tempo.sekundy} s, ` +
              `czyli około ${tempo.naMinute} słów na minutę. Dla porównania: swobodna mowa ` +
              "rodzimego użytkownika to 130-160 słów na minutę, a 60 słów na minutę i mniej " +
              "oznacza wyraźne zacinanie się.\n"
            : "Brak wiarygodnych pomiarów czasu — płynność oceniaj wyłącznie z treści zapisu.\n"),
      },
    ],
    { system, model: MODEL_GLOWNY, maxTokens: 5000, effort: "high" },
    null
  );

  if (!ocena) throw new BladApi(502, "Nie udało się ocenić egzaminu. Spróbuj ponownie.");

  // Składamy wynik sami — model podaje oceny cząstkowe, sumę liczy serwer
  const sprawnosc = zadania.map((nr, i) => {
    const wpis = (ocena.sprawnosc || []).find((s) => liczba(s.zadanie) === nr) || (ocena.sprawnosc || [])[i] || {};
    return {
      zadanie: nr,
      punkty: przytnij(wpis.punkty, 6),
      maks: 6,
      uzasadnienie: tekst(wpis.uzasadnienie, 600),
    };
  });

  const kryteria = {
    zakres: { punkty: przytnij(ocena.zakres?.punkty, 4), maks: 4, uzasadnienie: tekst(ocena.zakres?.uzasadnienie, 600) },
    poprawnosc: {
      punkty: przytnij(ocena.poprawnosc?.punkty, 4),
      maks: 4,
      uzasadnienie: tekst(ocena.poprawnosc?.uzasadnienie, 600),
    },
    wymowa: {
      punkty: przytnij(ocena.wymowa?.punkty, 2),
      maks: 2,
      uzasadnienie: tekst(ocena.wymowa?.uzasadnienie, 600),
      szacunkowe: true,
    },
    plynnosc: {
      punkty: przytnij(ocena.plynnosc?.punkty, 2),
      maks: 2,
      uzasadnienie: tekst(ocena.plynnosc?.uzasadnienie, 600),
      szacunkowe: !tempo,
    },
  };

  const razem =
    sprawnosc.reduce((a, s) => a + s.punkty, 0) +
    kryteria.zakres.punkty +
    kryteria.poprawnosc.punkty +
    kryteria.wymowa.punkty +
    kryteria.plynnosc.punkty;

  const maks = MAKS[tryb];
  const procent = Math.round((razem / maks) * 100);

  const szczegoly = {
    sprawnosc,
    ...kryteria,
    razem,
    maks,
    procent,
    // Próg zdania części ustnej to 30% punktów
    zdany: procent >= 30,
    tempo,
    bledy: (ocena.bledy || []).slice(0, 8),
    mocne: (ocena.mocne || []).slice(0, 5),
    doPoprawy: (ocena.doPoprawy || []).slice(0, 5),
    zwroty: (ocena.zwroty || []).slice(0, 6),
    komentarz: tekst(ocena.komentarz, 1200),
  };

  // XP: udział plus jakość. Trening jednego zadania daje mniej niż pełne podejście.
  const xp = (tryb === "pelny" ? 20 : 10) + Math.round(procent * (tryb === "pelny" ? 0.4 : 0.2));
  const streak = nowaPassa(uzytkownik.ostatni_dzien, dzis, liczba(uzytkownik.streak));

  const operacje = [
    env.DB.prepare(
      "UPDATE matura SET punkty = ?, maks = ?, szczegoly = ?, czas_sek = ?, status = 'zakonczony' WHERE id = ?"
    ).bind(razem, maks, JSON.stringify(szczegoly).slice(0, 40000), liczba(dane.czasSek), wiersz.id),
    env.DB.prepare(
      `INSERT INTO progress (id, user_id, data, dzien, typ, xp, wynik, czas_sek, notatki)
       VALUES (?, ?, ?, 0, 'matura', ?, ?, ?, ?)`
    ).bind(uuid(), uzytkownik.id, dzis, xp, procent, liczba(dane.czasSek), tekst(wiersz.temat, 500)),
    env.DB.prepare("UPDATE users SET xp = xp + ?, streak = ?, ostatni_dzien = ? WHERE id = ?").bind(
      xp,
      streak,
      dzis,
      uzytkownik.id
    ),
  ];

  // Brakujące zwroty trafiają do powtórek — inaczej zostałyby tylko na ekranie
  for (const z of szczegoly.zwroty) {
    if (!z?.en) continue;
    operacje.push(
      env.DB.prepare(
        `INSERT INTO vocab (id, user_id, en, pl, przyklad, dodano, pudelko, nastepna_powtorka, powtorek, bledow)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 0)`
      ).bind(uuid(), uzytkownik.id, tekst(z.en, 100), tekst(z.pl, 100), tekst(z.kiedy, 300), dzis, dataPlus(dzis, 1))
    );
  }

  await env.DB.batch(operacje);
  await zapiszKopie(env, uzytkownik.id, "po-maturze", strefaMin);

  return { xp, ocena: szczegoly };
}

// Porzucone podejście — kasujemy, żeby nie zaśmiecało historii
export async function porzucMature(env, uzytkownik, sesjaId) {
  await env.DB.prepare("DELETE FROM matura WHERE id = ? AND user_id = ? AND status = 'w-toku'")
    .bind(tekst(sesjaId, 64), uzytkownik.id)
    .run();
  return { ok: true };
}

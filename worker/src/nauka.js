// ============================================================
// Rdzeń nauki — stan, test poziomujący, plan, lekcja, rozmowa, słówka
// ============================================================
import { BladApi, uuid, dzisISO, terazISO, dataPlus, roznicaDni, bezpieczneJson, tekst, liczba } from "./pomoc.js";
import { wywolajAIJson, MODEL_GLOWNY, MODEL_ROZMOWA, DOSTAWCA_GEMINI } from "./ai.js";
import { zapiszKopie } from "./kopie.js";

// System Leitnera — odstęp w dniach dla pudełek 1..6
const ODSTEPY = [1, 2, 4, 8, 16, 32];

// ============================================================
// STAN — jedno zapytanie zwraca komplet danych na start aplikacji
// ============================================================

export async function pobierzStan(env, uzytkownik, strefaMin = 0) {
  const dzis = dzisISO(strefaMin);
  const id = uzytkownik.id;

  const [plan, postep, slowka, ocena] = await Promise.all([
    env.DB.prepare(
      "SELECT dzien, temat, cel, status, data_ukonczenia, (szczegoly != '') AS ma_szczegoly FROM plan WHERE user_id = ? ORDER BY dzien"
    )
      .bind(id)
      .all(),
    env.DB.prepare("SELECT data, dzien, typ, xp, wynik, czas_sek FROM progress WHERE user_id = ? ORDER BY data")
      .bind(id)
      .all(),
    env.DB.prepare("SELECT * FROM vocab WHERE user_id = ? ORDER BY nastepna_powtorka").bind(id).all(),
    env.DB.prepare("SELECT * FROM assessments WHERE user_id = ? ORDER BY data DESC LIMIT 1").bind(id).first(),
  ]);

  const wierszePlanu = (plan.results || []).map((p) => ({
    dzien: liczba(p.dzien),
    temat: p.temat,
    cel: p.cel,
    status: p.status,
    dataUkonczenia: p.data_ukonczenia,
    maSzczegoly: !!liczba(p.ma_szczegoly),
  }));

  const wierszePostepu = (postep.results || []).map((p) => ({
    data: p.data,
    dzien: liczba(p.dzien),
    typ: p.typ,
    xp: liczba(p.xp),
    wynik: liczba(p.wynik),
    czasSek: liczba(p.czas_sek),
  }));

  // Bieżący dzień nauki = pierwszy nieukończony w planie
  let biezacy = 0;
  for (const p of wierszePlanu) {
    if (p.status !== "ukonczony") {
      biezacy = p.dzien;
      break;
    }
  }
  if (!biezacy && wierszePlanu.length) biezacy = wierszePlanu[wierszePlanu.length - 1].dzien;

  // Passa wygasa, gdy ostatnia nauka była wcześniej niż wczoraj
  let streak = liczba(uzytkownik.streak);
  if (uzytkownik.ostatni_dzien && roznicaDni(uzytkownik.ostatni_dzien, dzis) > 1) streak = 0;

  return {
    user: {
      id,
      nazwa: uzytkownik.nazwa,
      poziom: uzytkownik.poziom || "",
      celDzienny: liczba(uzytkownik.cel_dzienny, 15),
      streak,
      xp: liczba(uzytkownik.xp),
      ostatniDzien: uzytkownik.ostatni_dzien || "",
      maPin: !!uzytkownik.pin_hash,
      ustawienia: bezpieczneJson(uzytkownik.ustawienia, {
        glos: true,
        mikrofon: true,
        tempoMowy: 0.95,
        modelRozmowy: "haiku",
      }),
    },
    ocena: ocena
      ? {
          data: ocena.data,
          poziom: ocena.poziom,
          punkty: liczba(ocena.punkty),
          mocne: bezpieczneJson(ocena.mocne, []),
          slabe: bezpieczneJson(ocena.slabe, []),
          komentarz: ocena.komentarz || "",
        }
      : null,
    plan: wierszePlanu,
    postep: wierszePostepu,
    slowka: (slowka.results || []).map((v) => ({
      id: v.id,
      en: v.en,
      pl: v.pl,
      przyklad: v.przyklad,
      pudelko: liczba(v.pudelko, 1),
      nastepnaPowtorka: v.nastepna_powtorka,
      powtorek: liczba(v.powtorek),
      bledow: liczba(v.bledow),
      doPowtorki: v.nastepna_powtorka <= dzis,
    })),
    biezacyDzien: biezacy,
    dzis,
    zrobioneDzis: wierszePostepu.some((p) => p.data === dzis && p.typ === "lekcja"),
  };
}

export async function zapiszUstawienia(env, uzytkownik, dane) {
  const ustawienia = dane.ustawienia || {};
  const cel = Math.min(60, Math.max(5, liczba(ustawienia.celDzienny, liczba(uzytkownik.cel_dzienny, 15))));
  await env.DB.prepare("UPDATE users SET ustawienia = ?, cel_dzienny = ? WHERE id = ?")
    .bind(JSON.stringify(ustawienia), cel, uzytkownik.id)
    .run();
  return { ok: true };
}

// ============================================================
// TEST POZIOMUJĄCY
// ============================================================

export async function generujTest(env) {
  const system =
    "Jesteś egzaminatorem języka angielskiego. Układasz krótki test plasujący dla polskojęzycznego " +
    "dorosłego, którego celem jest nauczyć się MÓWIĆ po angielsku.\n" +
    "Ułóż dokładnie 12 zadań o rosnącej trudności, od A1 do C1:\n" +
    '- 8 zadań typu "wybor": luka w zdaniu lub naturalna reakcja w rozmowie, 3 opcje, dokładnie jedna poprawna.\n' +
    '- 4 zadania typu "otwarte": pytania konwersacyjne po angielsku (odpowiedź 1-3 zdania), ' +
    "po jednym na poziomach A2, B1, B2 i C1.\n" +
    "Sprawdzaj żywy język mówiony, nie akademicką gramatykę.\n" +
    "Odpowiedz WYŁĄCZNIE poprawnym JSON-em:\n" +
    '{"pytania":[{"id":1,"typ":"wybor","poziom":"A1","pytanie":"...","opcje":["...","...","..."],"poprawna":0},' +
    '{"id":9,"typ":"otwarte","poziom":"A2","pytanie":"..."}]}';

  const dane = await wywolajAIJson(
    env,
    [{ role: "user", content: "Ułóż test plasujący." }],
    { system, model: MODEL_GLOWNY, maxTokens: 4000, effort: "medium" },
    null
  );

  if (!dane?.pytania?.length) throw new BladApi(502, "Nie udało się wygenerować testu. Spróbuj ponownie.");
  return { pytania: dane.pytania };
}

export async function ocenTest(env, uzytkownik, dane) {
  const odpowiedzi = Array.isArray(dane.odpowiedzi) ? dane.odpowiedzi : [];
  if (!odpowiedzi.length) throw new BladApi(400, "Brak odpowiedzi do oceny.");
  const strefaMin = liczba(dane.strefaMin);

  const system =
    "Jesteś doświadczonym lektorem angielskiego i egzaminatorem CEFR. Oceniasz test plasujący " +
    "polskojęzycznego dorosłego ucznia. Bądź rzetelny, ale nie zaniżaj — liczy się realna zdolność komunikacji.\n" +
    "1. Ustal poziom CEFR: A1, A2, B1, B2 albo C1.\n" +
    "2. Wypisz 3-4 mocne strony i 3-5 słabych stron — konkretnie: czasy, przedimki, przyimki, szyk zdania, " +
    "zasób słów, płynność.\n" +
    "3. Ułóż 30-dniowy plan NASTAWIONY NA KONWERSACJĘ. Każdy dzień to jeden temat rozmowy z życia codziennego " +
    "lub pracy, dopasowany do poziomu, z narastającą trudnością, celowo wracający do słabych stron ucznia. " +
    "Żadnych dni czysto gramatycznych — gramatyka wchodzi przez rozmowę.\n" +
    'Pola "temat" i "cel" pisz po polsku, "temat" do 60 znaków.\n' +
    "Odpowiedz WYŁĄCZNIE poprawnym JSON-em:\n" +
    '{"poziom":"B1","punkty":62,"mocne":["..."],"slabe":["..."],"komentarz":"2-3 zdania po polsku",' +
    '"plan":[{"dzien":1,"temat":"...","cel":"..."}]}\n' +
    "Plan MUSI mieć dokładnie 30 pozycji, dni 1..30.";

  const wynik = await wywolajAIJson(
    env,
    [{ role: "user", content: `Uczeń: ${uzytkownik.nazwa}\n\nOdpowiedzi z testu:\n${JSON.stringify(odpowiedzi)}` }],
    { system, model: MODEL_GLOWNY, maxTokens: 12000, effort: "high" },
    null
  );

  if (!wynik?.poziom || !wynik?.plan?.length) {
    throw new BladApi(502, "Nie udało się ocenić testu. Spróbuj ponownie.");
  }

  const dzis = dzisISO(strefaMin);
  const operacje = [
    env.DB.prepare(
      `INSERT INTO assessments (id, user_id, data, poziom, punkty, mocne, slabe, komentarz, surowe)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      uuid(),
      uzytkownik.id,
      dzis,
      tekst(wynik.poziom, 4),
      liczba(wynik.punkty),
      JSON.stringify(wynik.mocne || []),
      JSON.stringify(wynik.slabe || []),
      tekst(wynik.komentarz, 1000),
      JSON.stringify(odpowiedzi).slice(0, 20000)
    ),
    // Nowa ocena zastępuje poprzedni plan
    env.DB.prepare("DELETE FROM plan WHERE user_id = ?").bind(uzytkownik.id),
    env.DB.prepare("UPDATE users SET poziom = ? WHERE id = ?").bind(tekst(wynik.poziom, 4), uzytkownik.id),
  ];

  wynik.plan.slice(0, 30).forEach((p, i) => {
    operacje.push(
      env.DB.prepare(
        `INSERT INTO plan (id, user_id, dzien, temat, cel, status, data_ukonczenia, szczegoly)
         VALUES (?, ?, ?, ?, ?, 'nowy', '', '')`
      ).bind(uuid(), uzytkownik.id, liczba(p.dzien, i + 1), tekst(p.temat, 200), tekst(p.cel, 500))
    );
  });

  await env.DB.batch(operacje);
  await zapiszKopie(env, uzytkownik.id, "po-ocenie", strefaMin);

  const swiezy = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uzytkownik.id).first();
  return {
    poziom: wynik.poziom,
    punkty: liczba(wynik.punkty),
    mocne: wynik.mocne || [],
    slabe: wynik.slabe || [],
    komentarz: wynik.komentarz || "",
    stan: await pobierzStan(env, swiezy, strefaMin),
  };
}

// ============================================================
// LEKCJA DNIA — materiał generowany leniwie i zapamiętywany
// ============================================================

export async function pobierzLekcje(env, uzytkownik, dzien) {
  const wiersz = await env.DB.prepare("SELECT * FROM plan WHERE user_id = ? AND dzien = ?")
    .bind(uzytkownik.id, liczba(dzien))
    .first();
  if (!wiersz) throw new BladApi(404, `Nie znaleziono dnia ${dzien} w planie.`);

  const zapisane = bezpieczneJson(wiersz.szczegoly, null);
  if (zapisane?.scenariusz) {
    return { ...zapisane, dzien: liczba(dzien), temat: wiersz.temat, cel: wiersz.cel, status: wiersz.status };
  }

  const ocena = await env.DB.prepare("SELECT slabe FROM assessments WHERE user_id = ? ORDER BY data DESC LIMIT 1")
    .bind(uzytkownik.id)
    .first();
  const slabe = bezpieczneJson(ocena?.slabe, []);

  const system =
    "Jesteś lektorem angielskiego przygotowującym JEDNĄ dzienną lekcję dla polskojęzycznego " +
    `ucznia na poziomie ${uzytkownik.poziom || "A2"}.\n` +
    `Lekcja trwa około ${liczba(uzytkownik.cel_dzienny, 15)} minut.\n\n` +
    "NAJWAŻNIEJSZE: to lekcja MÓWIENIA I SŁUCHANIA. Uczeń będzie słuchał przez głośnik " +
    "i odpowiadał głosem — nie będzie czytał. Czytanie to najwyżej 10% lekcji.\n" +
    "Wszystko, co uczeń zobaczy lub usłyszy po angielsku, pisz tak, żeby dobrze brzmiało " +
    "czytane na głos: krótkie zdania, naturalna mowa potoczna, formy ściągnięte (I'm, don't, " +
    "let's). Żadnych wypunktowań, nawiasów ani skrótów typu e.g. — one się nie da czytać głosem.\n\n" +
    "Przygotuj:\n" +
    "- 8 słówek lub zwrotów kluczowych (angielski, polski, krótkie zdanie przykładowe po angielsku),\n" +
    "- 3 zwroty do aktywnego użycia w rozmowie,\n" +
    "- scenariusz roli dla rozmówcy AI: kim jest i gdzie jesteście, po angielsku,\n" +
    "- pierwszą kwestię rozmówcy po angielsku: 1-2 naturalne zdania otwierające rozmowę, " +
    "zakończone pytaniem, żeby uczeń od razu musiał się odezwać,\n" +
    '- "zadanieUcznia": jedno zdanie PO ANGIELSKU mówiące, co uczeń ma dziś osiągnąć w rozmowie ' +
    '(np. "Order a coffee and ask about the wifi password"),\n' +
    "- 3 pytania pomocnicze po angielsku, gdyby uczeń utknął,\n" +
    '- "wskazowka" po polsku: jedna rzecz, na którą uczeń ma dziś szczególnie uważać.\n' +
    (slabe.length ? `\nSłabe strony ucznia do przepracowania: ${slabe.join("; ")}\n` : "") +
    "\nOdpowiedz WYŁĄCZNIE poprawnym JSON-em:\n" +
    '{"slownictwo":[{"en":"","pl":"","przyklad":""}],"struktury":["..."],"scenariusz":"...",' +
    '"pierwszaKwestia":"...","zadanieUcznia":"...","pytaniaPomocnicze":["..."],"wskazowka":"..."}';

  const dane = await wywolajAIJson(
    env,
    [{ role: "user", content: `Dzień ${dzien}. Temat: ${wiersz.temat}. Cel: ${wiersz.cel}` }],
    { system, model: MODEL_GLOWNY, maxTokens: 4000, effort: "medium" },
    null
  );

  if (!dane?.scenariusz) throw new BladApi(502, "Nie udało się przygotować lekcji. Spróbuj ponownie.");

  await env.DB.prepare("UPDATE plan SET szczegoly = ? WHERE user_id = ? AND dzien = ?")
    .bind(JSON.stringify(dane), uzytkownik.id, liczba(dzien))
    .run();

  return { ...dane, dzien: liczba(dzien), temat: wiersz.temat, cel: wiersz.cel, status: wiersz.status };
}

// ============================================================
// ROZMOWA
// ============================================================

export async function czat(env, uzytkownik, dane) {
  const dzien = liczba(dane.dzien);
  const wiadomosc = tekst(dane.wiadomosc, 2000).trim();
  if (!wiadomosc) throw new BladApi(400, "Pusta wiadomość.");

  const poziom = uzytkownik.poziom || "A2";
  const ustawienia = bezpieczneJson(uzytkownik.ustawienia, {});
  const wybor = ustawienia.modelRozmowy;

  // Wybór dotyczy wyłącznie tur rozmowy — ocena poziomu, plan i podsumowania
  // zawsze idą przez Opus 5, bo robi się je rzadko i muszą być dobre
  const ustawieniaModelu =
    wybor === "opus" ? { model: MODEL_GLOWNY, effort: "medium" }
    : wybor === "gemini" ? { dostawca: DOSTAWCA_GEMINI }
    : { model: MODEL_ROZMOWA };

  const system =
    "Jesteś native speakerem i cierpliwym partnerem do rozmowy po angielsku. " +
    `Uczeń jest Polakiem na poziomie ${poziom}.\n` +
    `SCENARIUSZ: ${tekst(dane.scenariusz, 1500) || "Swobodna rozmowa na temat: " + tekst(dane.temat, 200)}\n\n` +
    "TO JEST ROZMOWA GŁOSOWA. Uczeń SŁUCHA Twojej odpowiedzi przez głośnik i odpowiada " +
    "mikrofonem. Tekstu zwykle nie widzi. To zmienia wszystko:\n\n" +
    "ZASADY:\n" +
    `1. Odpowiadaj PO ANGIELSKU, na poziomie ${poziom}. MAKSYMALNIE 2 zdania. Krócej znaczy lepiej — ` +
    "uczeń ma mówić więcej niż Ty.\n" +
    "2. Pisz tak, jak się mówi: formy ściągnięte, naturalna mowa potoczna. Żadnych wypunktowań, " +
    "nawiasów, emoji ani skrótów typu e.g. — to wszystko brzmi absurdalnie czytane na głos.\n" +
    "3. ZAWSZE kończ pytaniem. Bez pytania rozmowa się urywa i uczeń przestaje mówić.\n" +
    "4. Nie wykładaj gramatyki w rozmowie — zostań w roli.\n" +
    "5. Jeśli uczeń nie zrozumiał albo prosi o powtórzenie, powiedz to samo prościej i wolniej " +
    "innymi słowami. Nie dodawaj nowego wątku.\n" +
    "6. Uczeń mówi do mikrofonu, więc dostajesz zapis rozpoznanej mowy — bez interpunkcji " +
    "i czasem z przekręconym słowem. Domyślaj się sensu i NIE czep się tego. " +
    "Poprawiaj tylko realne błędy językowe, nie usterki rozpoznawania.\n" +
    '7. Błędy zgłaszaj wyłącznie w polu "korekta" (po polsku) i tylko takie, które utrudniają ' +
    "zrozumienie albo brzmią nienaturalnie. Drobiazgi puszczaj.\n" +
    "8. Jeśli uczeń odezwie się po polsku, wróć do angielskiego i podaj mu zwrot, którego szukał.\n" +
    '9. "noweSlowa" wypełniaj tylko wtedy, gdy sam użyłeś słowa spoza poziomu ucznia.\n' +
    '10. "ocena" to 0-100: jak dobra komunikacyjnie była TA wypowiedź ucznia.\n\n' +
    "POWTARZANIE ZA WZOREM — najważniejszy mechanizm nauki mówienia:\n" +
    'Gdy uczeń popełni błąd wart przećwiczenia, wypełnij "doPowtorzenia" poprawną frazą po angielsku ' +
    "(krótką, do 12 słów — tyle da się powtórzyć z pamięci).\n" +
    'Wtedy w polu "odpowiedz" NAJPIERW popraw go po angielsku i poproś o powtórzenie, ' +
    'na przykład: "Almost! We say: I\'d like a coffee, please. Can you say that?" — ' +
    "i wyjątkowo NIE kończ tej wypowiedzi pytaniem o treść rozmowy, bo uczeń ma teraz powtarzać, " +
    "nie odpowiadać.\n" +
    'Gdy nie ma czego ćwiczyć, ustaw "doPowtorzenia": null i prowadź rozmowę normalnie.\n' +
    "Nie żądaj powtórzenia częściej niż co druga wypowiedź — inaczej rozmowa zamienia się w musztrę.\n\n" +
    (dane.powtorzenie
      ? "UWAGA: uczeń właśnie POWTARZAŁ frazę, o którą prosiłeś. Krótko go pochwal i NATYCHMIAST " +
        'wróć do rozmowy pytaniem o jej treść. Nie poprawiaj tej powtórki i nie proś o kolejną — ' +
        'ustaw "korekta": null oraz "doPowtorzenia": null.\n\n'
      : "") +
    "Odpowiedz WYŁĄCZNIE poprawnym JSON-em:\n" +
    '{"odpowiedz":"...","korekta":{"bylo":"...","powinno":"...","dlaczego":"..."},' +
    '"doPowtorzenia":"...","noweSlowa":[{"en":"","pl":""}],"ocena":75}\n' +
    'Gdy nie ma czego poprawiać, ustaw "korekta": null.';

  // Ostatnie 8 wymian wystarczy na kontekst i trzyma koszt w ryzach
  const historia = Array.isArray(dane.historia) ? dane.historia.slice(-16) : [];
  const wiadomosci = historia
    .filter((w) => w?.content)
    .map((w) => ({ role: w.role === "assistant" ? "assistant" : "user", content: tekst(w.content, 2000) }));
  wiadomosci.push({ role: "user", content: wiadomosc });

  const odp = await wywolajAIJson(env, wiadomosci, { system, maxTokens: 1000, ...ustawieniaModelu }, {
    odpowiedz: "Sorry, could you say that again?",
    korekta: null,
    doPowtorzenia: null,
    noweSlowa: [],
    ocena: 0,
  });

  const ts = terazISO(liczba(dane.strefaMin));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO chat (id, user_id, dzien, ts, rola, tresc) VALUES (?, ?, ?, ?, 'user', ?)").bind(
      uuid(),
      uzytkownik.id,
      dzien,
      ts,
      wiadomosc
    ),
    env.DB.prepare("INSERT INTO chat (id, user_id, dzien, ts, rola, tresc) VALUES (?, ?, ?, ?, 'assistant', ?)").bind(
      uuid(),
      uzytkownik.id,
      dzien,
      ts,
      tekst(odp.odpowiedz, 4000)
    ),
  ]);

  return {
    odpowiedz: tekst(odp.odpowiedz, 4000),
    korekta: odp.korekta || null,
    // Fraza do powtórzenia na głos. Krótka, bo dłuższej nikt nie powtórzy z pamięci.
    doPowtorzenia: dane.powtorzenie ? null : tekst(odp.doPowtorzenia, 200) || null,
    noweSlowa: Array.isArray(odp.noweSlowa) ? odp.noweSlowa.slice(0, 5) : [],
    ocena: liczba(odp.ocena),
  };
}

export async function historiaCzatu(env, uzytkownik, dzien) {
  const { results } = await env.DB.prepare(
    "SELECT rola, tresc, ts FROM chat WHERE user_id = ? AND dzien = ? ORDER BY rowid"
  )
    .bind(uzytkownik.id, liczba(dzien))
    .all();
  return { historia: results || [] };
}

// ============================================================
// ZAKOŃCZENIE LEKCJI
// ============================================================

export async function zakonczLekcje(env, uzytkownik, dzien, dane) {
  const strefaMin = liczba(dane.strefaMin);
  const dzis = dzisISO(strefaMin);
  const wypowiedzi = (Array.isArray(dane.wypowiedzi) ? dane.wypowiedzi : []).map((w) => tekst(w, 1000));
  const korekty = Array.isArray(dane.korekty) ? dane.korekty.slice(0, 30) : [];

  let podsumowanie = { ocena: 0, bledy: [], mocne: [], doPoprawy: [], komentarz: "", nowaSlowka: [] };

  if (wypowiedzi.length) {
    const system =
      "Jesteś lektorem angielskiego. Podsumuj dzisiejszą rozmowę polskiego ucznia na poziomie " +
      `${uzytkownik.poziom || "A2"}. Bądź konkretny i życzliwy.\n\n` +
      "Uczeń MÓWIŁ, a jego wypowiedzi przeszły przez rozpoznawanie mowy — nie ma w nich " +
      "interpunkcji, a pojedyncze słowa mogły zostać przekręcone przez sam mikrofon. " +
      "NIE traktuj tego jako błędów językowych. Oceniaj dobór słów, gramatykę i naturalność, " +
      "nie zapis.\n\n" +
      'Najważniejsze jest pole "bledy": wypisz KONKRETNE potknięcia z tej rozmowy. ' +
      'Dla każdego podaj "bylo" (co uczeń faktycznie powiedział, cytat), "powinno" ' +
      '(poprawna wersja po angielsku) i "dlaczego" (krótkie wyjaśnienie po polsku — reguła, ' +
      "nie ogólnik). Od 0 do 6 pozycji, od najważniejszego. Gdy uczeń mówił bez błędów, daj pustą tablicę.\n" +
      'W "doPoprawy" pisz, nad czym pracować dalej — to wnioski, nie pojedyncze zdania.\n\n' +
      "Odpowiedz WYŁĄCZNIE poprawnym JSON-em:\n" +
      '{"ocena":0-100,"bledy":[{"bylo":"","powinno":"","dlaczego":""}],' +
      '"mocne":["po polsku"],"doPoprawy":["po polsku"],' +
      '"komentarz":"2-3 zdania po polsku","nowaSlowka":[{"en":"","pl":"","przyklad":""}]}\n' +
      'W "nowaSlowka" daj 3-6 zwrotów, których uczniowi wyraźnie brakowało w tej rozmowie.';

    podsumowanie = await wywolajAIJson(
      env,
      [
        {
          role: "user",
          content: `Wypowiedzi ucznia:\n${wypowiedzi.join("\n")}\n\nKorekty zgłoszone w trakcie:\n${JSON.stringify(korekty)}`,
        },
      ],
      { system, model: MODEL_GLOWNY, maxTokens: 2500, effort: "medium" },
      podsumowanie
    );
  }

  const xp =
    10 + // za samo podejście
    Math.min(40, wypowiedzi.length * 4) + // za aktywność w rozmowie
    Math.round(liczba(podsumowanie.ocena) * 0.5); // za jakość

  // Passa: +1 dzień po dniu, reset po przerwie, bez podwójnego liczenia tego samego dnia
  let streak = liczba(uzytkownik.streak);
  const ostatni = uzytkownik.ostatni_dzien || "";
  if (ostatni === dzis) {
    // dzisiaj już policzone
  } else if (ostatni && roznicaDni(ostatni, dzis) === 1) {
    streak += 1;
  } else {
    streak = 1;
  }

  const operacje = [
    env.DB.prepare("UPDATE plan SET status = 'ukonczony', data_ukonczenia = ? WHERE user_id = ? AND dzien = ?").bind(
      dzis,
      uzytkownik.id,
      liczba(dzien)
    ),
    env.DB.prepare(
      `INSERT INTO progress (id, user_id, data, dzien, typ, xp, wynik, czas_sek, notatki)
       VALUES (?, ?, ?, ?, 'lekcja', ?, ?, ?, ?)`
    ).bind(
      uuid(),
      uzytkownik.id,
      dzis,
      liczba(dzien),
      xp,
      liczba(podsumowanie.ocena),
      liczba(dane.czasSek),
      tekst(podsumowanie.komentarz, 500)
    ),
    env.DB.prepare("UPDATE users SET xp = xp + ?, streak = ?, ostatni_dzien = ? WHERE id = ?").bind(
      xp,
      streak,
      dzis,
      uzytkownik.id
    ),
  ];

  // Nowe słówka wpadają do powtórek na jutro
  for (const s of (podsumowanie.nowaSlowka || []).slice(0, 8)) {
    if (!s?.en) continue;
    operacje.push(
      env.DB.prepare(
        `INSERT INTO vocab (id, user_id, en, pl, przyklad, dodano, pudelko, nastepna_powtorka, powtorek, bledow)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 0)`
      ).bind(uuid(), uzytkownik.id, tekst(s.en, 100), tekst(s.pl, 100), tekst(s.przyklad, 300), dzis, dataPlus(dzis, 1))
    );
  }

  await env.DB.batch(operacje);
  await zapiszKopie(env, uzytkownik.id, "po-lekcji", strefaMin);

  const swiezy = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uzytkownik.id).first();
  return { xp, podsumowanie, stan: await pobierzStan(env, swiezy, strefaMin) };
}

// ============================================================
// SŁÓWKA
// ============================================================

export async function dodajSlowko(env, uzytkownik, dane) {
  const en = tekst(dane.en, 100).trim();
  if (!en) throw new BladApi(400, "Puste słowo.");
  const dzis = dzisISO(liczba(dane.strefaMin));
  const id = uuid();

  await env.DB.prepare(
    `INSERT INTO vocab (id, user_id, en, pl, przyklad, dodano, pudelko, nastepna_powtorka, powtorek, bledow)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 0)`
  )
    .bind(id, uzytkownik.id, en, tekst(dane.pl, 100), tekst(dane.przyklad, 300), dzis, dataPlus(dzis, 1))
    .run();

  return { id };
}

export async function zapiszPowtorke(env, uzytkownik, slowkoId, dane) {
  const wiersz = await env.DB.prepare("SELECT * FROM vocab WHERE id = ? AND user_id = ?")
    .bind(tekst(slowkoId, 64), uzytkownik.id)
    .first();
  if (!wiersz) throw new BladApi(404, "Nie znaleziono słówka.");

  const dzis = dzisISO(liczba(dane.strefaMin));
  const umiem = !!dane.umiem;
  const pudelko = umiem ? Math.min(ODSTEPY.length, liczba(wiersz.pudelko, 1) + 1) : 1;
  const bledow = liczba(wiersz.bledow) + (umiem ? 0 : 1);

  await env.DB.prepare(
    "UPDATE vocab SET pudelko = ?, bledow = ?, powtorek = powtorek + 1, nastepna_powtorka = ? WHERE id = ?"
  )
    .bind(pudelko, bledow, dataPlus(dzis, ODSTEPY[pudelko - 1]), wiersz.id)
    .run();

  return { ok: true, pudelko, nastepnaPowtorka: dataPlus(dzis, ODSTEPY[pudelko - 1]) };
}

export async function usunSlowko(env, uzytkownik, slowkoId) {
  await env.DB.prepare("DELETE FROM vocab WHERE id = ? AND user_id = ?").bind(tekst(slowkoId, 64), uzytkownik.id).run();
  return { ok: true };
}

// Zdanie przykładowe na życzenie — gdy uczeń dodaje słówko ręcznie
export async function wyjasnijSlowko(env, uzytkownik, dane) {
  const en = tekst(dane.en, 100).trim();
  if (!en) throw new BladApi(400, "Puste słowo.");

  const system =
    `Jesteś lektorem angielskiego. Uczeń jest Polakiem na poziomie ${uzytkownik.poziom || "A2"}. ` +
    "Dla podanego słowa lub zwrotu podaj polskie tłumaczenie i jedno krótkie, naturalne zdanie przykładowe po angielsku.\n" +
    'Odpowiedz WYŁĄCZNIE poprawnym JSON-em: {"pl":"...","przyklad":"..."}';

  const odp = await wywolajAIJson(env, [{ role: "user", content: en }], { system, model: MODEL_ROZMOWA, maxTokens: 400 }, {
    pl: "",
    przyklad: "",
  });

  return { pl: tekst(odp.pl, 100), przyklad: tekst(odp.przyklad, 300) };
}

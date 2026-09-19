// ============================================================
// Angielski AI — Cloudflare Worker (API)
// Trasy pod /api/*, dane w D1, klucz modelu w sekrecie Workera.
// ============================================================
import { BladApi, json, naglowkiCors, liczba, tekst } from "./pomoc.js";
import {
  listaProfili,
  zarejestruj,
  zaloguj,
  wyloguj,
  wymagajUzytkownika,
  zmienPin,
  zmienNazwe,
  rowneStalyCzas,
} from "./auth.js";
import {
  pobierzStan,
  zapiszUstawienia,
  generujTest,
  ocenTest,
  pobierzLekcje,
  czat,
  historiaCzatu,
  zakonczLekcje,
  dodajSlowko,
  zapiszPowtorke,
  usunSlowko,
  wyjasnijSlowko,
} from "./nauka.js";
import { listaKopii, utworzKopieRecznie, eksportuj, przywroc, przywrocZMigawki } from "./kopie.js";
import {
  pobierzStanMatury,
  pobierzPodejscie,
  nowyZestaw,
  turaMatury,
  ocenMature,
  porzucMature,
} from "./matura.js";
import { diagnostyka } from "./ai.js";

// Znacznik wersji kodu — widoczny w /api/health.
// Pozwala sprawdzic golym okiem, ktora wersja naprawde dziala na serwerze.
const WERSJA_KODU = "2026-09-19-matura-profile";
import {
  rozpocznijPolaczenie,
  obsluzPowrot,
  statusDysku,
  listaKopiiZDysku,
  wyslijKopie,
  przywrocZDysku,
  rozlaczDysk,
} from "./dysk.js";

async function czytajBody(request) {
  if (request.method === "GET" || request.method === "DELETE") return {};
  try {
    return (await request.json()) || {};
  } catch {
    throw new BladApi(400, "Nieprawidłowe dane wejściowe (oczekiwano JSON).");
  }
}

async function trasuj(request, env, ctx) {
  const url = new URL(request.url);
  const sciezka = url.pathname.replace(/\/+$/, "") || "/";
  const metoda = request.method;
  const body = await czytajBody(request);
  const strefaMin = liczba(body.strefaMin ?? url.searchParams.get("strefaMin"));

  // --- Trasy publiczne ---

  if (sciezka === "/api/health") {
    return json(
      {
        ok: true,
        usluga: "angielski-ai",
        wersja: WERSJA_KODU,
        baza: !!env.DB,
        klucz: !!env.ANTHROPIC_API_KEY,
        kodRejestracjiWymagany: !!env.KOD_REJESTRACJI,
        gemini: !!env.GEMINI_API_KEY,
        // Bez klucza Pexels zdjęcia do matury lecą z Wikimedia Commons
        zdjeciaPexels: !!env.PEXELS_API_KEY,
        dyskSkonfigurowany: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      },
      env
    );
  }

  // Powrót z autoryzacji Google — bez tokenu sesji, bo przychodzi z przeglądarki.
  // Tożsamość profilu niesie jednorazowy token stanu wystawiony przy starcie.
  if (sciezka === "/api/dysk/callback" && metoda === "GET") {
    return obsluzPowrot(env, request);
  }

  // Diagnostyka połączenia z modelem. Celowo bez sesji, bo służy sytuacjom,
  // w których nie da się zalogować — ale KAŻDE wejście tutaj wykonuje płatne
  // zapytanie do modelu. Na publicznym adresie bez zabezpieczenia byłaby to
  // otwarta furtka do podbijania rachunku, dlatego wymaga kodu rejestracji.
  // Klucz API nie jest ujawniany — tylko jego kształt (długość, początek,
  // obecność białych znaków).
  if (sciezka === "/api/diagnostyka" && metoda === "GET") {
    if (!env.KOD_REJESTRACJI) {
      throw new BladApi(403, "Diagnostyka wymaga ustawionego sekretu KOD_REJESTRACJI.");
    }
    if (!rowneStalyCzas(tekst(url.searchParams.get("kod"), 200), env.KOD_REJESTRACJI)) {
      throw new BladApi(403, "Nieprawidłowy kod. Dodaj ?kod=... z kodem rejestracji.");
    }
    return json(await diagnostyka(env), env);
  }

  if (sciezka === "/api/auth/profile" && metoda === "GET") {
    return json({ profile: await listaProfili(env) }, env);
  }

  if (sciezka === "/api/auth/rejestracja" && metoda === "POST") {
    return json(await zarejestruj(env, body), env);
  }

  if (sciezka === "/api/auth/logowanie" && metoda === "POST") {
    return json(await zaloguj(env, body), env);
  }

  // --- Od tego miejsca wymagana sesja ---

  const uzytkownik = await wymagajUzytkownika(request, env);

  if (sciezka === "/api/auth/wylogowanie" && metoda === "POST") {
    return json(await wyloguj(request, env), env);
  }

  if (sciezka === "/api/auth/pin" && metoda === "POST") {
    return json(await zmienPin(env, uzytkownik, body), env);
  }

  if (sciezka === "/api/auth/nazwa" && metoda === "POST") {
    return json(await zmienNazwe(env, uzytkownik, body), env);
  }

  if (sciezka === "/api/stan" && metoda === "GET") {
    return json(await pobierzStan(env, uzytkownik, strefaMin), env);
  }

  if (sciezka === "/api/ustawienia" && metoda === "POST") {
    return json(await zapiszUstawienia(env, uzytkownik, body), env);
  }

  // --- Test poziomujący ---

  if (sciezka === "/api/test/start" && metoda === "POST") {
    return json(await generujTest(env), env);
  }

  if (sciezka === "/api/test/ocena" && metoda === "POST") {
    return json(await ocenTest(env, uzytkownik, body), env);
  }

  // --- Lekcje i rozmowa ---

  const dopasowanieLekcji = sciezka.match(/^\/api\/lekcja\/(\d+)$/);
  if (dopasowanieLekcji && metoda === "GET") {
    return json(await pobierzLekcje(env, uzytkownik, Number(dopasowanieLekcji[1])), env);
  }

  const dopasowanieKonca = sciezka.match(/^\/api\/lekcja\/(\d+)\/koniec$/);
  if (dopasowanieKonca && metoda === "POST") {
    const wynik = await zakonczLekcje(env, uzytkownik, Number(dopasowanieKonca[1]), body);

    // Kopia na Dysk leci po odesłaniu podsumowania — uczeń nie czeka na Google,
    // a nieudany zapis na Dysk nie psuje zakończonej lekcji
    if (uzytkownik.dysk_refresh && ctx) {
      ctx.waitUntil(
        wyslijKopie(env, uzytkownik, "po-lekcji").catch((e) =>
          console.error("Kopia na Dysk nieudana:", e.message)
        )
      );
    }

    return json(wynik, env);
  }

  if (sciezka === "/api/czat" && metoda === "POST") {
    return json(await czat(env, uzytkownik, body), env);
  }

  const dopasowanieHistorii = sciezka.match(/^\/api\/czat\/(\d+)$/);
  if (dopasowanieHistorii && metoda === "GET") {
    return json(await historiaCzatu(env, uzytkownik, Number(dopasowanieHistorii[1])), env);
  }

  // --- Matura ustna ---

  if (sciezka === "/api/matura" && metoda === "GET") {
    return json(await pobierzStanMatury(env, uzytkownik), env);
  }

  if (sciezka === "/api/matura/zestaw" && metoda === "POST") {
    return json(await nowyZestaw(env, uzytkownik, body), env);
  }

  if (sciezka === "/api/matura/tura" && metoda === "POST") {
    return json(await turaMatury(env, uzytkownik, body), env);
  }

  const dopasowanieOceny = sciezka.match(/^\/api\/matura\/([\w-]+)\/ocena$/);
  if (dopasowanieOceny && metoda === "POST") {
    const wynik = await ocenMature(env, uzytkownik, dopasowanieOceny[1], body);

    // Kopia na Dysk po odesłaniu wyniku — tak samo jak po lekcji
    if (uzytkownik.dysk_refresh && ctx) {
      ctx.waitUntil(
        wyslijKopie(env, uzytkownik, "po-maturze").catch((e) =>
          console.error("Kopia na Dysk nieudana:", e.message)
        )
      );
    }

    const swiezy = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uzytkownik.id).first();
    return json({ ...wynik, stan: await pobierzStan(env, swiezy, strefaMin) }, env);
  }

  const dopasowaniePodejscia = sciezka.match(/^\/api\/matura\/([\w-]+)$/);
  if (dopasowaniePodejscia && metoda === "GET") {
    return json(await pobierzPodejscie(env, uzytkownik, dopasowaniePodejscia[1]), env);
  }

  if (dopasowaniePodejscia && metoda === "DELETE") {
    return json(await porzucMature(env, uzytkownik, dopasowaniePodejscia[1]), env);
  }

  // --- Słówka ---

  if (sciezka === "/api/slowka" && metoda === "POST") {
    return json(await dodajSlowko(env, uzytkownik, body), env);
  }

  if (sciezka === "/api/slowka/wyjasnij" && metoda === "POST") {
    return json(await wyjasnijSlowko(env, uzytkownik, body), env);
  }

  const dopasowaniePowtorki = sciezka.match(/^\/api\/slowka\/([\w-]+)\/powtorka$/);
  if (dopasowaniePowtorki && metoda === "POST") {
    return json(await zapiszPowtorke(env, uzytkownik, dopasowaniePowtorki[1], body), env);
  }

  const dopasowanieSlowka = sciezka.match(/^\/api\/slowka\/([\w-]+)$/);
  if (dopasowanieSlowka && metoda === "DELETE") {
    return json(await usunSlowko(env, uzytkownik, dopasowanieSlowka[1]), env);
  }

  // --- Kopie zapasowe ---

  if (sciezka === "/api/kopie" && metoda === "GET") {
    return json(await listaKopii(env, uzytkownik), env);
  }

  if (sciezka === "/api/kopie" && metoda === "POST") {
    return json(await utworzKopieRecznie(env, uzytkownik, strefaMin), env);
  }

  if (sciezka === "/api/kopie/eksport" && metoda === "GET") {
    const dane = await eksportuj(env, uzytkownik);
    const nazwa = `angielski-ai_${String(uzytkownik.nazwa).replace(/[^\w]/g, "_")}_${dane.utworzono.slice(0, 10)}.json`;
    return json(dane, env, 200, { "Content-Disposition": `attachment; filename="${nazwa}"` });
  }

  if (sciezka === "/api/kopie/przywroc" && metoda === "POST") {
    if (body.backupId) {
      return json(await przywrocZMigawki(env, uzytkownik, tekst(body.backupId, 64), strefaMin), env);
    }
    return json(await przywroc(env, uzytkownik, body), env);
  }

  // --- Dysk Google ---

  if (sciezka === "/api/dysk/status" && metoda === "GET") {
    return json(await statusDysku(env, uzytkownik), env);
  }

  if (sciezka === "/api/dysk/start" && metoda === "POST") {
    return json(await rozpocznijPolaczenie(env, request, uzytkownik), env);
  }

  if (sciezka === "/api/dysk/kopie" && metoda === "GET") {
    return json(await listaKopiiZDysku(env, uzytkownik), env);
  }

  if (sciezka === "/api/dysk/kopia" && metoda === "POST") {
    return json(await wyslijKopie(env, uzytkownik, "reczna"), env);
  }

  if (sciezka === "/api/dysk/przywroc" && metoda === "POST") {
    return json(await przywrocZDysku(env, uzytkownik, tekst(body.fileId, 128), strefaMin), env);
  }

  if (sciezka === "/api/dysk/rozlacz" && metoda === "POST") {
    return json(await rozlaczDysk(env, uzytkownik), env);
  }

  throw new BladApi(404, "Nieznana trasa: " + sciezka);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: naglowkiCors(env) });
    }

    try {
      return await trasuj(request, env, ctx);
    } catch (e) {
      if (e instanceof BladApi) {
        return json({ blad: e.message }, env, e.kod);
      }
      console.error("Nieobsłużony błąd:", e?.stack || e);
      return json({ blad: "Błąd serwera: " + (e?.message || "nieznany") }, env, 500);
    }
  },
};

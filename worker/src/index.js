// ============================================================
// Angielski AI — Cloudflare Worker (API)
// Trasy pod /api/*, dane w D1, klucz modelu w sekrecie Workera.
// ============================================================
import { BladApi, json, naglowkiCors, liczba, tekst } from "./pomoc.js";
import { listaProfili, zarejestruj, zaloguj, wyloguj, wymagajUzytkownika, zmienPin } from "./auth.js";
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
        baza: !!env.DB,
        klucz: !!env.ANTHROPIC_API_KEY,
        kodRejestracjiWymagany: !!env.KOD_REJESTRACJI,
        gemini: !!env.GEMINI_API_KEY,
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

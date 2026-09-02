// ============================================================
// Kopie zapasowe na Dysku Google
//
// Zakres uprawnień: drive.file — aplikacja widzi WYŁĄCZNIE pliki, które
// sama utworzyła. Nie ma dostępu do reszty Twojego Dysku.
// ============================================================
import { BladApi, uuid, bezpieczneJson, tekst, liczba } from "./pomoc.js";
import { zbierzDane, przywroc } from "./kopie.js";

const AUTORYZACJA = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ZAKRES = "https://www.googleapis.com/auth/drive.file";

const NAZWA_FOLDERU = "Angielski AI — kopie";
const LIMIT_PLIKOW = 10; // ile kopii trzymamy na Dysku
const WAZNOSC_STANU = 15 * 60 * 1000; // token stanu OAuth żyje 15 minut

function sprawdzKonfiguracje(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new BladApi(
      501,
      "Worker nie ma danych OAuth Google. Ustaw GOOGLE_CLIENT_ID w wrangler.toml i GOOGLE_CLIENT_SECRET przez wrangler secret put."
    );
  }
}

function adresPowrotu(request) {
  return new URL(request.url).origin + "/api/dysk/callback";
}

// ============================================================
// AUTORYZACJA
// ============================================================

/** Krok 1 — adres, pod którym użytkownik zgadza się na dostęp. */
export async function rozpocznijPolaczenie(env, request, uzytkownik) {
  sprawdzKonfiguracje(env);

  const state = uuid() + uuid().replace(/-/g, "");
  await env.DB.batch([
    // Stare, niewykorzystane stany tego profilu tylko zaśmiecają tabelę
    env.DB.prepare("DELETE FROM oauth_state WHERE user_id = ? OR utworzono < ?").bind(
      uzytkownik.id,
      Date.now() - WAZNOSC_STANU
    ),
    env.DB.prepare("INSERT INTO oauth_state (state, user_id, utworzono) VALUES (?, ?, ?)").bind(
      state,
      uzytkownik.id,
      Date.now()
    ),
  ]);

  const parametry = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: adresPowrotu(request),
    response_type: "code",
    scope: ZAKRES,
    // offline + consent gwarantują refresh_token, także przy ponownym łączeniu
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return { url: `${AUTORYZACJA}?${parametry}` };
}

/** Krok 2 — Google odsyła tu użytkownika z kodem. Odpowiadamy stroną HTML. */
export async function obsluzPowrot(env, request) {
  const url = new URL(request.url);
  const kod = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const bladGoogle = url.searchParams.get("error");

  if (bladGoogle) return stronaWyniku(false, "Google odrzuciło zgodę: " + bladGoogle);
  if (!kod || !state) return stronaWyniku(false, "Brak kodu autoryzacji.");

  const wiersz = await env.DB.prepare("SELECT user_id, utworzono FROM oauth_state WHERE state = ?")
    .bind(state)
    .first();

  // Token stanu jest jednorazowy — zużywamy go niezależnie od dalszego wyniku
  await env.DB.prepare("DELETE FROM oauth_state WHERE state = ?").bind(state).run();

  if (!wiersz) return stronaWyniku(false, "Nieznany albo już zużyty token autoryzacji.");
  if (Date.now() - Number(wiersz.utworzono) > WAZNOSC_STANU) {
    return stronaWyniku(false, "Autoryzacja wygasła. Spróbuj połączyć konto jeszcze raz.");
  }

  try {
    sprawdzKonfiguracje(env);

    const odp = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: kod,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: adresPowrotu(request),
        grant_type: "authorization_code",
      }),
    });

    const dane = bezpieczneJson(await odp.text(), null);
    if (!odp.ok || !dane?.refresh_token) {
      return stronaWyniku(
        false,
        "Google nie zwróciło tokenu odświeżania" + (dane?.error_description ? ": " + dane.error_description : ".")
      );
    }

    // Adres e-mail konta wyciągamy z id_token — tylko po to, żeby pokazać go w aplikacji
    let email = "";
    if (dane.id_token) {
      const ladunek = bezpieczneJson(dekodujBase64Url(String(dane.id_token).split(".")[1] || ""), null);
      email = tekst(ladunek?.email || "", 120);
    }

    await env.DB.prepare("UPDATE users SET dysk_refresh = ?, dysk_email = ? WHERE id = ?")
      .bind(dane.refresh_token, email, wiersz.user_id)
      .run();

    return stronaWyniku(true, email ? "Połączono z kontem " + email : "Połączono z Dyskiem Google.");
  } catch (e) {
    return stronaWyniku(false, e.message);
  }
}

function dekodujBase64Url(tekstB64) {
  try {
    const uzupelniony = tekstB64.replace(/-/g, "+").replace(/_/g, "/");
    return atob(uzupelniony + "=".repeat((4 - (uzupelniony.length % 4)) % 4));
  } catch {
    return "";
  }
}

// Prosta strona powrotu — użytkownik ląduje tu w przeglądarce, nie w aplikacji
function stronaWyniku(sukces, wiadomosc) {
  const kolor = sukces ? "#1d9e75" : "#ef4444";
  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Angielski AI — Dysk Google</title>
<style>
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.k{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:28px;max-width:380px;text-align:center}
.i{font-size:46px;margin-bottom:10px}h1{font-size:19px;margin:0 0 10px;color:${kolor}}
p{color:#8b949e;font-size:14px;line-height:1.55;margin:0}
</style></head><body><div class="k">
<div class="i">${sukces ? "✓" : "✕"}</div>
<h1>${sukces ? "Gotowe" : "Nie udało się"}</h1>
<p>${escapujHtml(wiadomosc)}</p>
<p style="margin-top:14px">${sukces ? "Zamknij tę kartę i wróć do aplikacji." : "Zamknij tę kartę i spróbuj ponownie."}</p>
</div></body></html>`;

  return new Response(html, {
    status: sukces ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapujHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]));
}

// ============================================================
// TOKENY I ŻĄDANIA DO DYSKU
// ============================================================

async function swiezyToken(env, uzytkownik) {
  if (!uzytkownik.dysk_refresh) throw new BladApi(400, "Dysk Google nie jest połączony z tym profilem.");
  sprawdzKonfiguracje(env);

  const odp = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: uzytkownik.dysk_refresh,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  const dane = bezpieczneJson(await odp.text(), null);

  if (!odp.ok || !dane?.access_token) {
    // Cofnięta zgoda albo unieważniony token — czyścimy, żeby aplikacja
    // pokazała "niepołączony" zamiast w kółko próbować
    if (dane?.error === "invalid_grant") {
      await env.DB.prepare("UPDATE users SET dysk_refresh = '', dysk_folder = '', dysk_email = '' WHERE id = ?")
        .bind(uzytkownik.id)
        .run();
      throw new BladApi(401, "Dostęp do Dysku wygasł lub został cofnięty. Połącz konto ponownie.");
    }
    throw new BladApi(502, "Google odmówiło dostępu do Dysku" + (dane?.error_description ? ": " + dane.error_description : "."));
  }

  return dane.access_token;
}

async function zapytajDysk(token, adres, opcje = {}) {
  const odp = await fetch(adres, {
    ...opcje,
    headers: { Authorization: "Bearer " + token, ...(opcje.headers || {}) },
  });

  const tresc = await odp.text();
  if (!odp.ok) {
    const blad = bezpieczneJson(tresc, null);
    throw new BladApi(502, "Dysk Google: " + (blad?.error?.message || tresc.slice(0, 200)));
  }
  return tresc ? bezpieczneJson(tresc, {}) : {};
}

/** Folder z kopiami. Tworzymy raz i zapamiętujemy jego id. */
async function folderKopii(env, uzytkownik, token) {
  if (uzytkownik.dysk_folder) {
    // Użytkownik mógł skasować folder ręcznie — wtedy tworzymy nowy
    try {
      const istniejacy = await zapytajDysk(token, `${API}/files/${uzytkownik.dysk_folder}?fields=id,trashed`);
      if (istniejacy.id && !istniejacy.trashed) return uzytkownik.dysk_folder;
    } catch {
      // lecimy dalej i zakładamy folder od nowa
    }
  }

  const zapytanie = encodeURIComponent(
    `name='${NAZWA_FOLDERU}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const znalezione = await zapytajDysk(token, `${API}/files?q=${zapytanie}&fields=files(id)&pageSize=1`);

  let id = znalezione.files?.[0]?.id;

  if (!id) {
    const utworzony = await zapytajDysk(token, `${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: NAZWA_FOLDERU, mimeType: "application/vnd.google-apps.folder" }),
    });
    id = utworzony.id;
  }

  await env.DB.prepare("UPDATE users SET dysk_folder = ? WHERE id = ?").bind(id, uzytkownik.id).run();
  uzytkownik.dysk_folder = id;
  return id;
}

// ============================================================
// WYSYŁANIE I ODCZYT KOPII
// ============================================================

/**
 * Wysyła aktualne postępy na Dysk jako plik JSON i przycina stare kopie.
 * Wołane po lekcji przez ctx.waitUntil — nie może zatrzymać odpowiedzi.
 */
export async function wyslijKopie(env, uzytkownik, zrodlo = "auto") {
  if (!uzytkownik.dysk_refresh) return { ok: false, powod: "niepolaczony" };

  const token = await swiezyToken(env, uzytkownik);
  const folder = await folderKopii(env, uzytkownik, token);

  const dane = await zbierzDane(env, uzytkownik.id);
  dane.zrodlo = zrodlo;

  const znacznik = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const nazwa = `angielski-ai_${String(uzytkownik.nazwa).replace(/[^\w]/g, "_")}_${znacznik}.json`;

  // Upload wieloczęściowy: najpierw metadane, potem treść pliku
  const granica = "granica" + uuid().replace(/-/g, "");
  const cialo =
    `--${granica}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: nazwa, parents: [folder] }) +
    `\r\n--${granica}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(dane) +
    `\r\n--${granica}--`;

  const wyslany = await zapytajDysk(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name,size`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${granica}` },
    body: cialo,
  });

  await przytnijStareKopie(token, folder);

  return { ok: true, id: wyslany.id, nazwa: wyslany.name };
}

// Zostawiamy na Dysku tylko najnowsze kopie
async function przytnijStareKopie(token, folder) {
  try {
    const lista = await zapytajDysk(
      token,
      `${API}/files?q=${encodeURIComponent(`'${folder}' in parents and trashed=false`)}` +
        "&orderBy=createdTime desc&fields=files(id,createdTime)&pageSize=100"
    );

    for (const plik of (lista.files || []).slice(LIMIT_PLIKOW)) {
      await zapytajDysk(token, `${API}/files/${plik.id}`, { method: "DELETE" });
    }
  } catch (e) {
    // Przycinanie to porządki, nie powód do zgłaszania błędu użytkownikowi
    console.error("Nie udało się przyciąć kopii na Dysku:", e.message);
  }
}

export async function listaKopiiZDysku(env, uzytkownik) {
  if (!uzytkownik.dysk_refresh) return { polaczony: false, pliki: [] };

  const token = await swiezyToken(env, uzytkownik);
  const folder = await folderKopii(env, uzytkownik, token);

  const lista = await zapytajDysk(
    token,
    `${API}/files?q=${encodeURIComponent(`'${folder}' in parents and trashed=false`)}` +
      "&orderBy=createdTime desc&fields=files(id,name,size,createdTime)&pageSize=50"
  );

  return {
    polaczony: true,
    email: uzytkownik.dysk_email || "",
    pliki: (lista.files || []).map((p) => ({
      id: p.id,
      nazwa: p.name,
      rozmiar: liczba(p.size),
      utworzono: String(p.createdTime || "").slice(0, 16).replace("T", " "),
    })),
  };
}

export async function przywrocZDysku(env, uzytkownik, fileId, strefaMin) {
  const token = await swiezyToken(env, uzytkownik);

  const odp = await fetch(`${API}/files/${encodeURIComponent(tekst(fileId, 128))}?alt=media`, {
    headers: { Authorization: "Bearer " + token },
  });

  if (!odp.ok) throw new BladApi(502, "Nie udało się pobrać pliku z Dysku (" + odp.status + ").");

  return przywroc(env, uzytkownik, { json: await odp.text(), strefaMin });
}

export async function statusDysku(env, uzytkownik) {
  return {
    polaczony: !!uzytkownik.dysk_refresh,
    email: uzytkownik.dysk_email || "",
    skonfigurowany: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  };
}

export async function rozlaczDysk(env, uzytkownik) {
  // Unieważniamy token po stronie Google — samo skasowanie go u nas
  // zostawiłoby aplikację na liście uprawnień konta
  if (uzytkownik.dysk_refresh) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: uzytkownik.dysk_refresh }),
      });
    } catch {
      // Nawet gdy Google nie odpowie, czyścimy dane u siebie
    }
  }

  await env.DB.prepare("UPDATE users SET dysk_refresh = '', dysk_folder = '', dysk_email = '' WHERE id = ?")
    .bind(uzytkownik.id)
    .run();

  return { ok: true };
}

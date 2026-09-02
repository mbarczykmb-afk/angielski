// ============================================================
// Warstwa AI — rozmowa i generowanie materiałów przez Claude API
// ============================================================
import { BladApi, bezpieczneJson } from "./pomoc.js";
import { wywolajGemini } from "./gemini.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

// Opus 5 do zadań rzadkich i wymagających (ocena poziomu, plan, podsumowania).
export const MODEL_GLOWNY = "claude-opus-5";
// Haiku 4.5 do tur rozmowy — krótsze pauzy między zdaniami i wyraźnie niższy koszt.
export const MODEL_ROZMOWA = "claude-haiku-4-5";
// Gemini jako jeszcze tańsza alternatywa dla samych tur rozmowy.
export const DOSTAWCA_GEMINI = "gemini";

/**
 * Jedno wywołanie modelu. Zwraca sklejony tekst odpowiedzi.
 * opcje: { system, model, maxTokens, effort, dostawca, json }
 *
 * Kieruje zapytanie do wybranego dostawcy — reszta aplikacji nie musi
 * wiedzieć, który model odpowiada.
 */
export async function wywolajAI(env, wiadomosci, opcje = {}) {
  if (opcje.dostawca === DOSTAWCA_GEMINI) {
    return wywolajGemini(env, wiadomosci, opcje);
  }
  return wywolajClaude(env, wiadomosci, opcje);
}

async function wywolajClaude(env, wiadomosci, opcje = {}) {
  const klucz = env.ANTHROPIC_API_KEY;
  if (!klucz) {
    throw new BladApi(500, "Worker nie ma klucza API. Ustaw go: npx wrangler secret put ANTHROPIC_API_KEY");
  }

  const model = opcje.model || MODEL_GLOWNY;
  const payload = {
    model,
    max_tokens: opcje.maxTokens || 2000,
    messages: wiadomosci,
  };
  if (opcje.system) payload.system = opcje.system;

  // Adaptacyjne myślenie i sterowanie wysiłkiem obsługuje rodzina Opus/Sonnet 5.
  // Haiku 4.5 odrzuca oba parametry, więc dla tur rozmowy wysyłamy gołe zapytanie.
  if (model !== MODEL_ROZMOWA) {
    payload.thinking = { type: "adaptive" };
    payload.output_config = { effort: opcje.effort || "medium" };
  }

  async function wyslij(cialo) {
    let odpowiedz;
    try {
      odpowiedz = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": klucz,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(cialo),
      });
    } catch (e) {
      throw new BladApi(502, "Nie udało się połączyć z API modelu: " + e.message);
    }
    return { odpowiedz, tresc: await odpowiedz.text() };
  }

  let { odpowiedz: odp, tresc: body } = await wyslij(payload);

  // Adaptacyjne myślenie i sterowanie wysiłkiem nie są dostępne na każdym koncie
  // ani w każdym planie. Zamiast wywracać naukę na parametrze, który tylko
  // podnosi jakość, ponawiamy raz bez niego — lepiej działać nieco prościej
  // niż nie działać wcale. Odrzucenie ląduje w logach, żeby dało się je poznać.
  if (odp.status === 400 && payload.thinking) {
    console.error("Anthropic odrzuciło parametry rozszerzone, ponawiam bez nich:", body.slice(0, 600));

    const uproszczony = { ...payload };
    delete uproszczony.thinking;
    delete uproszczony.output_config;

    ({ odpowiedz: odp, tresc: body } = await wyslij(uproszczony));
  }

  if (!odp.ok) {
    const blad = bezpieczneJson(body, null);
    const szczegol = blad?.error?.message || body.slice(0, 300) || "(brak treści błędu)";

    // Pełna odpowiedź trafia do logów — widać ją przez `npx wrangler tail`,
    // gdy komunikat dla użytkownika okaże się za ubogi na diagnozę
    console.error(`Anthropic ${odp.status} dla modelu ${model}:`, body.slice(0, 1000));

    if (odp.status === 401) {
      throw new BladApi(500, "Nieprawidłowy klucz API modelu (401). Ustaw go ponownie w Workerze.");
    }
    if (odp.status === 429) {
      throw new BladApi(429, "Limit zapytań do modelu przekroczony. Spróbuj za chwilę.");
    }
    if (odp.status >= 500) {
      throw new BladApi(502, "API modelu chwilowo niedostępne. Spróbuj za chwilę.");
    }

    // Najczęstsze 400 przy świeżym koncie — nazywamy je po imieniu,
    // bo surowy komunikat Anthropic nic użytkownikowi nie mówi
    if (/credit balance is too low/i.test(szczegol)) {
      throw new BladApi(
        402,
        "Konto Anthropic nie ma środków. Wejdź na console.anthropic.com → Plans & Billing i doładuj konto."
      );
    }
    if (/not_found|does not exist|invalid model/i.test(szczegol)) {
      throw new BladApi(
        500,
        `Twoje konto nie ma dostępu do modelu ${model}. Sprawdź go na console.anthropic.com.`
      );
    }

    throw new BladApi(502, `Błąd API modelu (${odp.status}): ${szczegol}`);
  }

  const dane = bezpieczneJson(body, null);
  if (!dane) throw new BladApi(502, "API modelu zwróciło nieczytelną odpowiedź.");

  // Klasyfikatory bezpieczeństwa mogą odmówić — to HTTP 200, nie wyjątek.
  if (dane.stop_reason === "refusal") {
    throw new BladApi(422, "Model odmówił odpowiedzi na tę treść. Sformułuj to inaczej.");
  }

  const tresc = (dane.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return tresc.trim();
}

/**
 * Diagnostyka połączenia z API modelu.
 *
 * Wykonuje najprostsze możliwe zapytanie i zwraca wszystko, co potrzebne do
 * ustalenia przyczyny: status, nagłówki odpowiedzi (mówią, KTO odrzucił),
 * treść błędu oraz kształt klucza — bez ujawniania go samego.
 */
export async function diagnostyka(env) {
  const klucz = env.ANTHROPIC_API_KEY || "";

  // Klucz opisujemy, nie pokazujemy. Wystarczy, by wykryć typowe pomyłki:
  // pusty, ze spacją, z cudzysłowem albo wklejony razem z fragmentem komendy.
  const oKluczu = {
    ustawiony: !!klucz,
    dlugosc: klucz.length,
    poczatek: klucz.slice(0, 7),
    zaczynaSieOdSkAnt: klucz.startsWith("sk-ant-"),
    maBialeZnaki: /\s/.test(klucz),
    maCudzyslowy: /["']/.test(klucz),
    rozniSieOdPrzycietego: klucz !== klucz.trim(),
  };

  const payload = {
    model: MODEL_GLOWNY,
    max_tokens: 16,
    messages: [{ role: "user", content: "hi" }],
  };

  let wynik;
  try {
    const odp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": klucz,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(payload),
    });

    const naglowki = {};
    odp.headers.forEach((wartosc, nazwa) => {
      naglowki[nazwa] = wartosc;
    });

    const tresc = await odp.text();

    wynik = {
      status: odp.status,
      ok: odp.ok,
      dlugoscOdpowiedzi: tresc.length,
      naglowki,
      tresc: tresc.slice(0, 800),
    };
  } catch (e) {
    wynik = { wyjatek: e.name + ": " + e.message };
  }

  return {
    model: MODEL_GLOWNY,
    wyslanePola: Object.keys(payload),
    klucz: oKluczu,
    odpowiedz: wynik,
  };
}

/**
 * Wyciąga JSON z odpowiedzi modelu. Model bywa, że opakuje go w ```json ... ```
 * albo dopisze zdanie wstępu — obcinamy do pierwszego nawiasu i ostatniego domknięcia.
 */
export function wyjmijJson(tekstOdpowiedzi, domyslne = null) {
  if (!tekstOdpowiedzi) return domyslne;
  let t = String(tekstOdpowiedzi).trim();

  const plot = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (plot) t = plot[1].trim();

  const start = t.search(/[[{]/);
  if (start > 0) t = t.slice(start);

  const koniec = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (koniec > -1) t = t.slice(0, koniec + 1);

  return bezpieczneJson(t, domyslne);
}

/**
 * Wywołanie wymagające odpowiedzi w JSON. Przy pierwszym niepowodzeniu
 * dopytujemy model raz, twardo przypominając o formacie.
 */
export async function wywolajAIJson(env, wiadomosci, opcje = {}, domyslne) {
  // Gemini potrafi wymusić poprawny JSON po swojej stronie — dajemy mu znać
  const zJson = { ...opcje, json: true };

  const pierwsza = await wywolajAI(env, wiadomosci, zJson);
  const wynik = wyjmijJson(pierwsza, null);
  if (wynik) return wynik;

  const powtorka = [
    ...wiadomosci,
    { role: "assistant", content: pierwsza.slice(0, 500) || "..." },
    { role: "user", content: "Zwróć to samo wyłącznie jako poprawny JSON. Bez komentarza, bez znaczników ```." },
  ];
  const druga = await wywolajAI(env, powtorka, zJson);
  const wynik2 = wyjmijJson(druga, null);
  if (wynik2) return wynik2;

  if (domyslne !== undefined) return domyslne;
  throw new BladApi(502, "Model zwrócił odpowiedź w złym formacie. Spróbuj jeszcze raz.");
}

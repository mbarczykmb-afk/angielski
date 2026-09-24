// ============================================================
// Dostawca alternatywny — Google Gemini
//
// Używany wyłącznie do tur rozmowy, jeśli użytkownik go wybierze.
// Ocena poziomu, plan i podsumowania zostają na Claude.
// ============================================================
import { BladApi, bezpieczneJson } from "./pomoc.js";
import { czystyKlucz } from "./ai.js";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

// Identyfikator modelu da się nadpisać zmienną GEMINI_MODEL w wrangler.toml,
// bo Google zmienia nazwy częściej, niż wychodzą nowe wersje tej aplikacji.
export const MODEL_DOMYSLNY = "gemini-flash-latest";

/**
 * Zamienia historię w formacie Anthropic na format Gemini.
 * Różnice: rola "assistant" nazywa się "model", a treść siedzi w tablicy "parts".
 */
export function naFormatGemini(wiadomosci) {
  const tresci = wiadomosci.map((w) => ({
    role: w.role === "assistant" ? "model" : "user",
    parts: [{ text: String(w.content ?? "") }],
  }));

  // Gemini oczekuje, że rozmowę otwiera użytkownik. Nasza zaczyna się od
  // kwestii lektora, więc wiodące tury modelu odcinamy.
  let pierwszy = 0;
  while (pierwszy < tresci.length && tresci[pierwszy].role === "model") pierwszy++;

  return tresci.slice(pierwszy);
}

// Gdy wybrany model nie istnieje albo jest przeciążony, próbujemy kolejnych.
// "gemini-flash-latest" to alias, który Google przestawia na bieżący model Flash —
// działa nawet wtedy, gdy konkretna nazwa z konfiguracji wypadła z oferty.
export const MODELE_ZAPASOWE = ["gemini-flash-latest", "gemini-2.5-flash"];

const sen = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Błąd jednego wywołania z informacją, czy warto próbować dalej
class BladGemini extends BladApi {
  constructor(kod, wiadomosc, { status, szczegol, dalej } = {}) {
    super(kod, wiadomosc);
    this.status = status;
    this.szczegol = szczegol;
    this.dalej = dalej; // "ponow" — ten sam model jeszcze raz; "model" — następny model
  }
}

async function jednoWywolanie(klucz, model, payload) {
  let odp;
  try {
    odp = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": klucz },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new BladGemini(502, "Nie udało się połączyć z Gemini: " + e.message, { szczegol: e.message, dalej: "ponow" });
  }

  const body = await odp.text();

  if (!odp.ok) {
    const blad = bezpieczneJson(body, null);
    const szczegol = String(blad?.error?.message || body.slice(0, 300) || "").slice(0, 300);
    const st = odp.status;

    if (st === 400 && /API key not valid/i.test(szczegol)) {
      throw new BladGemini(500, "Nieprawidłowy klucz Gemini. Ustaw go ponownie w Workerze.", { status: st, szczegol });
    }
    if (st === 404) {
      throw new BladGemini(500, `Gemini nie zna modelu "${model}".`, { status: st, szczegol, dalej: "model" });
    }
    if (st === 403) {
      throw new BladGemini(500, "Gemini odmówiło dostępu (403): " + szczegol, { status: st, szczegol });
    }
    if (st === 429) {
      throw new BladGemini(429, "Limit zapytań Gemini przekroczony: " + szczegol, { status: st, szczegol, dalej: "model" });
    }
    if (st >= 500) {
      throw new BladGemini(502, `Gemini chwilowo niedostępne (${st}): ${szczegol}`, { status: st, szczegol, dalej: "ponow" });
    }
    throw new BladGemini(502, `Błąd Gemini (${st}): ${szczegol}`, { status: st, szczegol });
  }

  const dane = bezpieczneJson(body, null);
  if (!dane) throw new BladGemini(502, "Gemini zwróciło nieczytelną odpowiedź.", { dalej: "ponow" });

  const kandydat = dane.candidates?.[0];

  // Filtry bezpieczeństwa Google odrzucają treść bez błędu HTTP
  if (!kandydat || kandydat.finishReason === "SAFETY" || dane.promptFeedback?.blockReason) {
    throw new BladGemini(422, "Gemini odmówiło odpowiedzi na tę treść. Sformułuj to inaczej.");
  }

  const tekst = (kandydat.content?.parts || []).map((p) => p.text || "").join("");
  if (!tekst.trim()) {
    // Najczęściej: odpowiedź ucięta na limicie tokenów (modele myślące zużywają je na myślenie)
    throw new BladGemini(502, "Gemini zwróciło pustą odpowiedź.", { szczegol: kandydat.finishReason, dalej: "model" });
  }
  return tekst.trim();
}

/**
 * Jedno wywołanie Gemini. Zwraca sklejony tekst odpowiedzi.
 * opcje: { system, model, maxTokens, json }
 * dziennik — opcjonalna tablica, do której trafia przebieg prób (do diagnostyki)
 */
export async function wywolajGemini(env, wiadomosci, opcje = {}, dziennik = null) {
  const klucz = czystyKlucz(env.GEMINI_API_KEY);
  if (!klucz) {
    throw new BladApi(
      501,
      "Worker nie ma klucza Gemini. Dodaj sekret GEMINI_API_KEY albo wybierz inny model w Ustawieniach."
    );
  }

  const payload = {
    contents: naFormatGemini(wiadomosci),
    generationConfig: {
      // Nowsze modele Flash najpierw "myślą" i liczą to do limitu — z zapasem,
      // żeby na samą odpowiedź zostało miejsce
      maxOutputTokens: Math.max(2048, opcje.maxTokens || 0),
    },
  };
  if (opcje.system) payload.system_instruction = { parts: [{ text: opcje.system }] };
  // Gemini potrafi wymusić poprawny JSON po swojej stronie
  if (opcje.json) payload.generationConfig.responseMimeType = "application/json";

  const pierwszy = opcje.model || env.GEMINI_MODEL || MODEL_DOMYSLNY;
  const modele = [pierwszy, ...MODELE_ZAPASOWE.filter((m) => m !== pierwszy)];

  let ostatni = null;
  for (const model of modele) {
    for (let proba = 0; proba < 2; proba++) {
      try {
        const tekst = await jednoWywolanie(klucz, model, payload);
        if (dziennik) dziennik.push({ model, ok: true });
        return tekst;
      } catch (e) {
        ostatni = e;
        if (dziennik) dziennik.push({ model, ok: false, status: e.status || null, komunikat: e.szczegol || e.message });
        if (!(e instanceof BladGemini) || !e.dalej) throw e;
        if (e.dalej === "model" || proba === 1) break;
        await sen(700);
      }
    }
  }
  throw ostatni;
}

/**
 * Krótki test Gemini do Ustawień: czy klucz działa i który model odpowiada.
 * Zwraca przebieg prób z komunikatami Google — bez klucza i bez treści rozmów.
 */
export async function testGemini(env) {
  const proby = [];
  try {
    const tekst = await wywolajGemini(env, [{ role: "user", content: "Say OK." }], { maxTokens: 50 }, proby);
    return { ok: true, model: proby.filter((p) => p.ok).map((p) => p.model)[0] || null, odpowiedz: tekst.slice(0, 40), proby };
  } catch (e) {
    return { ok: false, blad: e.message, proby };
  }
}

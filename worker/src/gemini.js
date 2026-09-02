// ============================================================
// Dostawca alternatywny — Google Gemini
//
// Używany wyłącznie do tur rozmowy, jeśli użytkownik go wybierze.
// Ocena poziomu, plan i podsumowania zostają na Claude.
// ============================================================
import { BladApi, bezpieczneJson } from "./pomoc.js";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

// Identyfikator modelu da się nadpisać zmienną GEMINI_MODEL w wrangler.toml,
// bo Google zmienia nazwy częściej, niż wychodzą nowe wersje tej aplikacji.
export const MODEL_DOMYSLNY = "gemini-3.7-flash";

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

/**
 * Jedno wywołanie Gemini. Zwraca sklejony tekst odpowiedzi.
 * opcje: { system, model, maxTokens, json }
 */
export async function wywolajGemini(env, wiadomosci, opcje = {}) {
  const klucz = env.GEMINI_API_KEY;
  if (!klucz) {
    throw new BladApi(
      501,
      "Worker nie ma klucza Gemini. Dodaj sekret GEMINI_API_KEY albo wybierz inny model w Ustawieniach."
    );
  }

  const model = opcje.model || env.GEMINI_MODEL || MODEL_DOMYSLNY;

  const payload = {
    contents: naFormatGemini(wiadomosci),
    generationConfig: {
      maxOutputTokens: opcje.maxTokens || 1000,
    },
  };

  if (opcje.system) {
    payload.system_instruction = { parts: [{ text: opcje.system }] };
  }

  // Gemini potrafi wymusić poprawny JSON po swojej stronie — korzystamy,
  // bo to tańsze i pewniejsze niż proszenie o format w treści polecenia
  if (opcje.json) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  let odp;
  try {
    odp = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": klucz,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new BladApi(502, "Nie udało się połączyć z Gemini: " + e.message);
  }

  const body = await odp.text();

  if (!odp.ok) {
    const blad = bezpieczneJson(body, null);
    const szczegol = blad?.error?.message || body.slice(0, 300);

    if (odp.status === 400 && /API key not valid/i.test(szczegol)) {
      throw new BladApi(500, "Nieprawidłowy klucz Gemini. Ustaw go ponownie w Workerze.");
    }
    if (odp.status === 404) {
      throw new BladApi(
        500,
        `Gemini nie zna modelu "${model}". Ustaw poprawną nazwę w zmiennej GEMINI_MODEL (wrangler.toml).`
      );
    }
    if (odp.status === 403) throw new BladApi(500, "Gemini odmówiło dostępu (403). Sprawdź uprawnienia klucza.");
    if (odp.status === 429) throw new BladApi(429, "Limit zapytań Gemini przekroczony. Spróbuj za chwilę.");
    if (odp.status >= 500) throw new BladApi(502, "Gemini chwilowo niedostępne. Spróbuj za chwilę.");

    throw new BladApi(502, `Błąd Gemini (${odp.status}): ${szczegol}`);
  }

  const dane = bezpieczneJson(body, null);
  if (!dane) throw new BladApi(502, "Gemini zwróciło nieczytelną odpowiedź.");

  const kandydat = dane.candidates?.[0];

  // Filtry bezpieczeństwa Google odrzucają treść bez błędu HTTP
  if (!kandydat || kandydat.finishReason === "SAFETY" || dane.promptFeedback?.blockReason) {
    throw new BladApi(422, "Gemini odmówiło odpowiedzi na tę treść. Sformułuj to inaczej.");
  }

  const tekst = (kandydat.content?.parts || [])
    .map((p) => p.text || "")
    .join("");

  if (!tekst.trim()) {
    // Najczęściej: odpowiedź ucięta na limicie tokenów, zanim cokolwiek powstało
    throw new BladApi(502, "Gemini zwróciło pustą odpowiedź. Spróbuj jeszcze raz.");
  }

  return tekst.trim();
}

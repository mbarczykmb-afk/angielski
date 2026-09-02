// ============================================================
// Funkcje pomocnicze — odpowiedzi HTTP, daty, błędy
// ============================================================

// Błąd z kodem HTTP — router zamienia go na czytelną odpowiedź JSON
export class BladApi extends Error {
  constructor(kod, wiadomosc) {
    super(wiadomosc);
    this.kod = kod;
  }
}

export function naglowkiCors(env) {
  const dozwolone = (env && env.DOZWOLONY_ORIGIN) || "*";
  return {
    "Access-Control-Allow-Origin": dozwolone,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(dane, env, status = 200, dodatkowe = {}) {
  return new Response(JSON.stringify(dane), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...naglowkiCors(env),
      ...dodatkowe,
    },
  });
}

export function uuid() {
  return crypto.randomUUID();
}

// Data lokalna użytkownika. Telefon przysyła swoje przesunięcie strefy,
// więc "dziś" liczymy według zegara ucznia, a nie UTC serwera.
export function dzisISO(przesuniecieMin = 0) {
  const teraz = new Date(Date.now() - Number(przesuniecieMin || 0) * 60000);
  return teraz.toISOString().slice(0, 10);
}

export function terazISO(przesuniecieMin = 0) {
  const teraz = new Date(Date.now() - Number(przesuniecieMin || 0) * 60000);
  return teraz.toISOString().slice(0, 19).replace("T", " ");
}

export function dataPlus(iso, dni) {
  const [r, m, d] = String(iso).split("-").map(Number);
  const data = new Date(Date.UTC(r, m - 1, d));
  data.setUTCDate(data.getUTCDate() + Number(dni));
  return data.toISOString().slice(0, 10);
}

export function roznicaDni(od, doo) {
  if (!od || !doo) return 9999;
  const [r1, m1, d1] = String(od).split("-").map(Number);
  const [r2, m2, d2] = String(doo).split("-").map(Number);
  return Math.round((Date.UTC(r2, m2 - 1, d2) - Date.UTC(r1, m1 - 1, d1)) / 86400000);
}

export function bezpieczneJson(tekst, domyslne) {
  if (!tekst) return domyslne;
  try {
    return JSON.parse(tekst);
  } catch {
    return domyslne;
  }
}

export function tekst(wartosc, maks = 4000) {
  return String(wartosc ?? "").slice(0, maks);
}

export function liczba(wartosc, domyslna = 0) {
  const n = Number(wartosc);
  return Number.isFinite(n) ? n : domyslna;
}

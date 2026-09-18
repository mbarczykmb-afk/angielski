// ============================================================
// Zdjęcia do zadania 2 (opis ilustracji)
//
// Na maturze zdający dostaje fotografię, nie opis sceny. Model nie umie
// narysować zdjęcia, więc szukamy prawdziwego w otwartych zbiorach.
//
// Dwa źródła, w tej kolejności:
//   1. Pexels — zdjęcia z życia codziennego, dokładnie to, czego potrzebuje
//      to zadanie. Wymaga darmowego klucza w sekrecie PEXELS_API_KEY.
//   2. Wikimedia Commons — bez żadnego klucza, więc działa od razu,
//      ale trafność wyszukiwania bywa gorsza.
//
// Gdy oba zawiodą, zwracamy null i zadanie wraca do opisu słownego.
// Brak zdjęcia nie może wysadzić egzaminu.
// ============================================================

const LIMIT_MS = 6000;

async function pobierz(url, naglowki) {
  const przerwij = new AbortController();
  const zegar = setTimeout(() => przerwij.abort(), LIMIT_MS);
  try {
    const odp = await fetch(url, { headers: naglowki, signal: przerwij.signal });
    if (!odp.ok) return null;
    return await odp.json();
  } catch (e) {
    console.warn("Szukanie zdjęcia nieudane:", e.message);
    return null;
  } finally {
    clearTimeout(zegar);
  }
}

// Adres trafia prosto do atrybutu src, więc wpuszczamy wyłącznie https
function bezpiecznyAdres(adres) {
  const tekst = String(adres || "");
  return /^https:\/\/[^\s"'<>]+$/.test(tekst) ? tekst : "";
}

async function zPexels(env, zapytanie) {
  const klucz = String(env.PEXELS_API_KEY || "").trim();
  if (!klucz) return null;

  const dane = await pobierz(
    "https://api.pexels.com/v1/search?orientation=landscape&per_page=15&query=" + encodeURIComponent(zapytanie),
    { Authorization: klucz }
  );

  const zdjecia = (dane?.photos || []).filter((z) => bezpiecznyAdres(z?.src?.large));
  if (!zdjecia.length) return null;

  // Losujemy z wyników, żeby ten sam temat nie dawał zawsze tego samego zdjęcia
  const z = zdjecia[Math.floor(Math.random() * zdjecia.length)];
  return {
    url: bezpiecznyAdres(z.src.large),
    autor: String(z.photographer || "").slice(0, 100),
    zrodlo: "Pexels",
    strona: bezpiecznyAdres(z.url),
    licencja: "Pexels License",
  };
}

async function zWikimediaCommons(zapytanie) {
  // filetype:bitmap odsiewa mapy, wykresy i grafiki wektorowe — na egzaminie
  // opisuje się fotografię, nie schemat
  const szukaj =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=" +
    encodeURIComponent("filetype:bitmap " + zapytanie) +
    "&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1024";

  const dane = await pobierz(szukaj, {
    "User-Agent": "angielski-ai/1.0 (aplikacja do nauki angielskiego)",
  });

  const strony = Object.values(dane?.query?.pages || {});
  const kandydaci = strony.filter((s) => {
    const info = s?.imageinfo?.[0];
    return info && /^image\/(jpeg|png)$/.test(info.mime || "") && bezpiecznyAdres(info.thumburl);
  });

  if (!kandydaci.length) return null;

  const wybrany = kandydaci[Math.floor(Math.random() * kandydaci.length)];
  const info = wybrany.imageinfo[0];
  const meta = info.extmetadata || {};

  // Pole Artist bywa kawałkiem HTML — do podpisu bierzemy sam tekst
  const autor = String(meta.Artist?.value || "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 100);

  return {
    url: bezpiecznyAdres(info.thumburl),
    autor,
    zrodlo: "Wikimedia Commons",
    strona: bezpiecznyAdres(info.descriptionurl),
    licencja: String(meta.LicenseShortName?.value || "").slice(0, 60),
  };
}

/**
 * Szuka zdjęcia do sceny opisanej hasłami po angielsku.
 * Zwraca null, gdy nic nie znaleziono — wtedy zadanie korzysta z opisu słownego.
 */
export async function znajdzZdjecie(env, hasla) {
  const zapytanie = (Array.isArray(hasla) ? hasla : [hasla])
    .map((h) => String(h || "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 120);

  if (!zapytanie) return null;

  try {
    return (await zPexels(env, zapytanie)) || (await zWikimediaCommons(zapytanie));
  } catch (e) {
    console.warn("Nie udało się dobrać zdjęcia:", e.message);
    return null;
  }
}

// ============================================================
// Użytkownicy — profile, PIN, sesje
// ============================================================
import { BladApi, uuid, dzisISO, tekst, liczba } from "./pomoc.js";

const DNI_WAZNOSCI_SESJI = 90;
const ITERACJE_PBKDF2 = 100000;

// --- PIN ---------------------------------------------------

function naHex(bufor) {
  return [...new Uint8Array(bufor)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pochodnaPin(pin, solHex) {
  const enc = new TextEncoder();
  const klucz = await crypto.subtle.importKey("raw", enc.encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bity = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(solHex.match(/../g).map((h) => parseInt(h, 16))),
      iterations: ITERACJE_PBKDF2,
      hash: "SHA-256",
    },
    klucz,
    256
  );
  return naHex(bity);
}

export async function zahaszujPin(pin) {
  if (!pin) return "";
  const sol = naHex(crypto.getRandomValues(new Uint8Array(16)));
  return `${sol}:${await pochodnaPin(pin, sol)}`;
}

// Porównanie w stałym czasie — nie zdradzamy, ile znaków PIN-u się zgadza
export function rowneStalyCzas(a, b) {
  if (a.length !== b.length) return false;
  let roznica = 0;
  for (let i = 0; i < a.length; i++) roznica |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return roznica === 0;
}

export async function sprawdzPin(pin, zapisany) {
  if (!zapisany) return true; // profil bez PIN-u
  const [sol, oczekiwany] = String(zapisany).split(":");
  if (!sol || !oczekiwany) return false;
  return rowneStalyCzas(await pochodnaPin(pin || "", sol), oczekiwany);
}

// --- Sesje -------------------------------------------------

export async function utworzSesje(env, userId) {
  const token = uuid() + "." + uuid().replace(/-/g, "");
  const wygasa = Date.now() + DNI_WAZNOSCI_SESJI * 86400000;
  await env.DB.prepare("INSERT INTO sessions (token, user_id, utworzono, wygasa) VALUES (?, ?, ?, ?)")
    .bind(token, userId, new Date().toISOString(), wygasa)
    .run();
  return token;
}

// Zwraca użytkownika przypisanego do tokenu z nagłówka Authorization
export async function wymagajUzytkownika(request, env) {
  const naglowek = request.headers.get("Authorization") || "";
  const token = naglowek.startsWith("Bearer ") ? naglowek.slice(7).trim() : "";
  if (!token) throw new BladApi(401, "Brak tokenu sesji. Zaloguj się ponownie.");

  const wiersz = await env.DB.prepare(
    `SELECT u.*, s.wygasa FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
  )
    .bind(token)
    .first();

  if (!wiersz) throw new BladApi(401, "Sesja wygasła. Zaloguj się ponownie.");
  if (Number(wiersz.wygasa) < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    throw new BladApi(401, "Sesja wygasła. Zaloguj się ponownie.");
  }
  return wiersz;
}

export async function wyloguj(request, env) {
  const naglowek = request.headers.get("Authorization") || "";
  const token = naglowek.startsWith("Bearer ") ? naglowek.slice(7).trim() : "";
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return { ok: true };
}

// --- Profile -----------------------------------------------

export async function listaProfili(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, nazwa, poziom, streak, xp, pin_hash FROM users ORDER BY nazwa"
  ).all();
  return (results || []).map((u) => ({
    id: u.id,
    nazwa: u.nazwa,
    poziom: u.poziom || "",
    streak: liczba(u.streak),
    xp: liczba(u.xp),
    maPin: !!u.pin_hash,
  }));
}

/**
 * Sprawdza i porządkuje imię profilu.
 * Wydzielone, bo używa tego i rejestracja, i zmiana nazwy — a reguła
 * "dwa znaki i bez duplikatów" musi w obu miejscach znaczyć to samo.
 */
export function normalizujNazwe(wartosc) {
  // Spacje w srodku scalamy: "Piotr  K" i "Piotr K" to dla czlowieka to samo imie,
  // a jako dwa rozne profile robily by tylko zamieszanie przy wyborze
  const nazwa = tekst(wartosc, 30).replace(/\s+/g, " ").trim();
  if (nazwa.length < 2) throw new BladApi(400, "Imię musi mieć co najmniej 2 znaki.");
  return { nazwa, klucz: nazwa.toLowerCase() };
}

/**
 * Zmiana imienia profilu. Rusza WYŁĄCZNIE dwie kolumny w wierszu użytkownika —
 * postępy, plan, słówka, rozmowy i podejścia do matury wiszą na jego id,
 * którego nie dotykamy. Dlatego przemianowanie nie może zgubić danych.
 */
export async function zmienNazwe(env, uzytkownik, dane) {
  const { nazwa, klucz } = normalizujNazwe(dane.nazwa);

  const zajete = await env.DB.prepare("SELECT id FROM users WHERE nazwa_klucz = ? AND id != ?")
    .bind(klucz, uzytkownik.id)
    .first();
  if (zajete) throw new BladApi(409, "Profil o takim imieniu już istnieje.");

  await env.DB.prepare("UPDATE users SET nazwa = ?, nazwa_klucz = ? WHERE id = ?")
    .bind(nazwa, klucz, uzytkownik.id)
    .run();

  return { ok: true, nazwa };
}

export async function zarejestruj(env, dane) {
  const { nazwa, klucz } = normalizujNazwe(dane.nazwa);

  const pin = tekst(dane.pin, 12).trim();
  if (pin && !/^\d{4,8}$/.test(pin)) throw new BladApi(400, "PIN musi mieć od 4 do 8 cyfr.");

  // Kod rejestracji chroni publiczny adres Workera przed obcymi kontami na Twoim kluczu API
  if (env.KOD_REJESTRACJI && tekst(dane.kod, 60).trim() !== env.KOD_REJESTRACJI) {
    throw new BladApi(403, "Nieprawidłowy kod rejestracji.");
  }

  const istnieje = await env.DB.prepare("SELECT id FROM users WHERE nazwa_klucz = ?").bind(klucz).first();
  if (istnieje) throw new BladApi(409, "Profil o takim imieniu już istnieje.");

  const id = uuid();
  const cel = Math.min(60, Math.max(5, liczba(dane.celDzienny, 15)));
  await env.DB.prepare(
    `INSERT INTO users (id, nazwa, nazwa_klucz, pin_hash, utworzono, poziom, cel_dzienny, streak, ostatni_dzien, xp, ustawienia)
     VALUES (?, ?, ?, ?, ?, '', ?, 0, '', 0, ?)`
  )
    .bind(
      id,
      nazwa,
      klucz,
      await zahaszujPin(pin),
      dzisISO(dane.strefaMin),
      cel,
      JSON.stringify({ glos: true, mikrofon: true, tempoMowy: 0.95, modelRozmowy: "haiku" })
    )
    .run();

  const token = await utworzSesje(env, id);
  return { id, nazwa, token };
}

export async function zaloguj(env, dane) {
  const uzytkownik = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(tekst(dane.userId, 64)).first();
  if (!uzytkownik) throw new BladApi(404, "Nie znaleziono profilu.");

  if (!(await sprawdzPin(dane.pin, uzytkownik.pin_hash))) {
    throw new BladApi(401, "Błędny PIN.");
  }

  const token = await utworzSesje(env, uzytkownik.id);
  return { id: uzytkownik.id, nazwa: uzytkownik.nazwa, token };
}

export async function zmienPin(env, uzytkownik, dane) {
  if (uzytkownik.pin_hash && !(await sprawdzPin(dane.stary, uzytkownik.pin_hash))) {
    throw new BladApi(401, "Błędny obecny PIN.");
  }
  const nowy = tekst(dane.nowy, 12).trim();
  if (nowy && !/^\d{4,8}$/.test(nowy)) throw new BladApi(400, "PIN musi mieć od 4 do 8 cyfr.");

  await env.DB.prepare("UPDATE users SET pin_hash = ? WHERE id = ?")
    .bind(await zahaszujPin(nowy), uzytkownik.id)
    .run();
  return { ok: true, maPin: !!nowy };
}

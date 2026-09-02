// ============================================================
// Kopie zapasowe postępów — migawki w bazie, eksport i przywracanie
// ============================================================
import { BladApi, uuid, terazISO, bezpieczneJson, tekst, liczba } from "./pomoc.js";

const LIMIT_KOPII = 20; // ile migawek trzymamy na użytkownika
const FORMAT = "angielski-ai-backup";

// Komplet danych jednego użytkownika w jednym obiekcie
export async function zbierzDane(env, userId) {
  const [uzytkownik, assessments, plan, progress, chat, vocab] = await Promise.all([
    env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first(),
    env.DB.prepare("SELECT * FROM assessments WHERE user_id = ? ORDER BY data").bind(userId).all(),
    env.DB.prepare("SELECT * FROM plan WHERE user_id = ? ORDER BY dzien").bind(userId).all(),
    env.DB.prepare("SELECT * FROM progress WHERE user_id = ? ORDER BY data").bind(userId).all(),
    env.DB.prepare("SELECT * FROM chat WHERE user_id = ? ORDER BY rowid").bind(userId).all(),
    env.DB.prepare("SELECT * FROM vocab WHERE user_id = ? ORDER BY dodano").bind(userId).all(),
  ]);

  if (!uzytkownik) throw new BladApi(404, "Nie znaleziono profilu.");

  // PIN nie wychodzi poza serwer — kopia ma być bezpieczna do przechowania gdziekolwiek
  const { pin_hash, ...uzytkownikBezPin } = uzytkownik;

  return {
    format: FORMAT,
    wersjaFormatu: 1,
    utworzono: new Date().toISOString(),
    user: uzytkownikBezPin,
    assessments: assessments.results || [],
    plan: plan.results || [],
    progress: progress.results || [],
    chat: chat.results || [],
    vocab: vocab.results || [],
  };
}

// Migawka do bazy. Nie może wysadzić lekcji, więc błędy tylko logujemy.
export async function zapiszKopie(env, userId, zrodlo = "auto", strefaMin = 0) {
  try {
    const dane = await zbierzDane(env, userId);
    const snapshot = JSON.stringify(dane);

    await env.DB.prepare("INSERT INTO backups (id, user_id, ts, zrodlo, rozmiar, snapshot) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(uuid(), userId, terazISO(strefaMin), zrodlo, snapshot.length, snapshot)
      .run();

    // Zostawiamy tylko najnowsze migawki
    await env.DB.prepare(
      `DELETE FROM backups WHERE user_id = ? AND id NOT IN (
         SELECT id FROM backups WHERE user_id = ? ORDER BY ts DESC, rowid DESC LIMIT ?
       )`
    )
      .bind(userId, userId, LIMIT_KOPII)
      .run();

    return { ok: true, rozmiar: snapshot.length };
  } catch (e) {
    console.error("Kopia nieudana:", e.message);
    return { ok: false, blad: e.message };
  }
}

export async function utworzKopieRecznie(env, uzytkownik, strefaMin) {
  const wynik = await zapiszKopie(env, uzytkownik.id, "reczna", strefaMin);
  if (!wynik.ok) throw new BladApi(500, "Nie udało się zapisać kopii: " + wynik.blad);
  return listaKopii(env, uzytkownik);
}

export async function listaKopii(env, uzytkownik) {
  const { results } = await env.DB.prepare(
    "SELECT id, ts, zrodlo, rozmiar FROM backups WHERE user_id = ? ORDER BY ts DESC, rowid DESC"
  )
    .bind(uzytkownik.id)
    .all();
  return { kopie: results || [] };
}

// Pełny eksport do pliku — użytkownik zapisuje go sobie w telefonie albo na Dysku
export async function eksportuj(env, uzytkownik) {
  return zbierzDane(env, uzytkownik.id);
}

/**
 * Przywrócenie z pliku kopii. Nadpisuje wszystkie dane bieżącego profilu.
 * Przed nadpisaniem robi migawkę awaryjną — nieudany import nie kasuje postępów.
 */
export async function przywroc(env, uzytkownik, dane) {
  const kopia = typeof dane.json === "string" ? bezpieczneJson(dane.json, null) : dane.json;

  if (!kopia || kopia.format !== FORMAT) {
    throw new BladApi(400, "To nie jest plik kopii zapasowej Angielski AI.");
  }

  await zapiszKopie(env, uzytkownik.id, "przed-przywroceniem", liczba(dane.strefaMin));

  const id = uzytkownik.id;
  const operacje = [
    env.DB.prepare("DELETE FROM assessments WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM plan WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM progress WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM chat WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM vocab WHERE user_id = ?").bind(id),
  ];

  for (const a of kopia.assessments || []) {
    operacje.push(
      env.DB.prepare(
        `INSERT INTO assessments (id, user_id, data, poziom, punkty, mocne, slabe, komentarz, surowe)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uuid(),
        id,
        tekst(a.data, 10),
        tekst(a.poziom, 4),
        liczba(a.punkty),
        tekst(a.mocne, 4000) || "[]",
        tekst(a.slabe, 4000) || "[]",
        tekst(a.komentarz, 1000),
        tekst(a.surowe, 20000) || "[]"
      )
    );
  }

  for (const p of kopia.plan || []) {
    operacje.push(
      env.DB.prepare(
        `INSERT INTO plan (id, user_id, dzien, temat, cel, status, data_ukonczenia, szczegoly)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uuid(),
        id,
        liczba(p.dzien),
        tekst(p.temat, 200),
        tekst(p.cel, 500),
        tekst(p.status, 20) || "nowy",
        tekst(p.data_ukonczenia, 10),
        tekst(p.szczegoly, 20000)
      )
    );
  }

  for (const p of kopia.progress || []) {
    operacje.push(
      env.DB.prepare(
        `INSERT INTO progress (id, user_id, data, dzien, typ, xp, wynik, czas_sek, notatki)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uuid(),
        id,
        tekst(p.data, 10),
        liczba(p.dzien),
        tekst(p.typ, 20) || "lekcja",
        liczba(p.xp),
        liczba(p.wynik),
        liczba(p.czas_sek),
        tekst(p.notatki, 500)
      )
    );
  }

  // Historię czatu obcinamy — najstarsze rozmowy nie są warte limitu zapytań
  for (const c of (kopia.chat || []).slice(-500)) {
    operacje.push(
      env.DB.prepare("INSERT INTO chat (id, user_id, dzien, ts, rola, tresc) VALUES (?, ?, ?, ?, ?, ?)").bind(
        uuid(),
        id,
        liczba(c.dzien),
        tekst(c.ts, 30),
        c.rola === "assistant" ? "assistant" : "user",
        tekst(c.tresc, 4000)
      )
    );
  }

  for (const v of kopia.vocab || []) {
    if (!v?.en) continue;
    operacje.push(
      env.DB.prepare(
        `INSERT INTO vocab (id, user_id, en, pl, przyklad, dodano, pudelko, nastepna_powtorka, powtorek, bledow)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uuid(),
        id,
        tekst(v.en, 100),
        tekst(v.pl, 100),
        tekst(v.przyklad, 300),
        tekst(v.dodano, 10),
        liczba(v.pudelko, 1),
        tekst(v.nastepna_powtorka, 10),
        liczba(v.powtorek),
        liczba(v.bledow)
      )
    );
  }

  // Statystyki wracają; imię i PIN zostają te z bieżącego urządzenia
  if (kopia.user) {
    operacje.push(
      env.DB.prepare(
        "UPDATE users SET poziom = ?, cel_dzienny = ?, streak = ?, ostatni_dzien = ?, xp = ?, ustawienia = ? WHERE id = ?"
      ).bind(
        tekst(kopia.user.poziom, 4),
        liczba(kopia.user.cel_dzienny, 15),
        liczba(kopia.user.streak),
        tekst(kopia.user.ostatni_dzien, 10),
        liczba(kopia.user.xp),
        tekst(kopia.user.ustawienia, 4000) || "{}",
        id
      )
    );
  }

  // D1 przyjmuje ograniczoną liczbę operacji naraz — dzielimy na paczki
  for (let i = 0; i < operacje.length; i += 50) {
    await env.DB.batch(operacje.slice(i, i + 50));
  }

  return { ok: true, wczytano: operacje.length };
}

export async function przywrocZMigawki(env, uzytkownik, backupId, strefaMin) {
  const wiersz = await env.DB.prepare("SELECT snapshot FROM backups WHERE id = ? AND user_id = ?")
    .bind(tekst(backupId, 64), uzytkownik.id)
    .first();
  if (!wiersz) throw new BladApi(404, "Nie znaleziono kopii.");
  return przywroc(env, uzytkownik, { json: wiersz.snapshot, strefaMin });
}

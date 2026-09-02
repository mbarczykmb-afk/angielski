-- ============================================================
-- Angielski AI — schemat bazy D1 (SQLite)
-- Wgranie:  npx wrangler d1 execute angielski-ai --remote --file=./schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  nazwa         TEXT NOT NULL,
  nazwa_klucz   TEXT NOT NULL UNIQUE,   -- nazwa małymi literami, do wykrywania duplikatów
  pin_hash      TEXT NOT NULL DEFAULT '',
  utworzono     TEXT NOT NULL,
  poziom        TEXT NOT NULL DEFAULT '',
  cel_dzienny   INTEGER NOT NULL DEFAULT 15,
  streak        INTEGER NOT NULL DEFAULT 0,
  ostatni_dzien TEXT NOT NULL DEFAULT '',
  xp            INTEGER NOT NULL DEFAULT 0,
  ustawienia    TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  token    TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL,
  utworzono TEXT NOT NULL,
  wygasa   INTEGER NOT NULL,            -- znacznik czasu w ms
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS assessments (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL,
  data     TEXT NOT NULL,
  poziom   TEXT NOT NULL,
  punkty   INTEGER NOT NULL DEFAULT 0,
  mocne    TEXT NOT NULL DEFAULT '[]',
  slabe    TEXT NOT NULL DEFAULT '[]',
  komentarz TEXT NOT NULL DEFAULT '',
  surowe   TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_assess_user ON assessments(user_id);

CREATE TABLE IF NOT EXISTS plan (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  dzien           INTEGER NOT NULL,
  temat           TEXT NOT NULL DEFAULT '',
  cel             TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'nowy',   -- nowy | ukonczony
  data_ukonczenia TEXT NOT NULL DEFAULT '',
  szczegoly       TEXT NOT NULL DEFAULT '',       -- JSON z materiałem lekcji (generowany leniwie)
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, dzien)
);
CREATE INDEX IF NOT EXISTS idx_plan_user ON plan(user_id);

CREATE TABLE IF NOT EXISTS progress (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL,
  data     TEXT NOT NULL,
  dzien    INTEGER NOT NULL DEFAULT 0,
  typ      TEXT NOT NULL DEFAULT 'lekcja',        -- lekcja | powtorka
  xp       INTEGER NOT NULL DEFAULT 0,
  wynik    INTEGER NOT NULL DEFAULT 0,
  czas_sek INTEGER NOT NULL DEFAULT 0,
  notatki  TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id, data);

CREATE TABLE IF NOT EXISTS chat (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  dzien   INTEGER NOT NULL,
  ts      TEXT NOT NULL,
  rola    TEXT NOT NULL,                          -- user | assistant
  tresc   TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_user_dzien ON chat(user_id, dzien);

CREATE TABLE IF NOT EXISTS vocab (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  en                TEXT NOT NULL,
  pl                TEXT NOT NULL DEFAULT '',
  przyklad          TEXT NOT NULL DEFAULT '',
  dodano            TEXT NOT NULL,
  pudelko           INTEGER NOT NULL DEFAULT 1,   -- system Leitnera: 1..6
  nastepna_powtorka TEXT NOT NULL,
  powtorek          INTEGER NOT NULL DEFAULT 0,
  bledow            INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vocab_user ON vocab(user_id, nastepna_powtorka);

CREATE TABLE IF NOT EXISTS backups (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL,
  ts       TEXT NOT NULL,
  zrodlo   TEXT NOT NULL DEFAULT 'auto',
  rozmiar  INTEGER NOT NULL DEFAULT 0,
  snapshot TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_backups_user ON backups(user_id, ts);

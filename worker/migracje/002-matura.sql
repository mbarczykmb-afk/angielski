-- ============================================================
-- Migracja 002 — moduł "Matura ustna"
-- Wgranie:  npx wrangler d1 execute angielski-ai --remote --file=./migracje/002-matura.sql
--
-- Bezpieczna do wielokrotnego uruchomienia.
-- ============================================================

CREATE TABLE IF NOT EXISTS matura (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  data      TEXT NOT NULL,
  tryb      TEXT NOT NULL DEFAULT 'pelny',   -- pelny | zadanie1 | zadanie2 | zadanie3
  temat     TEXT NOT NULL DEFAULT '',
  obszar    TEXT NOT NULL DEFAULT '',        -- zakres tematyczny wymagań egzaminacyjnych
  zestaw    TEXT NOT NULL DEFAULT '{}',      -- JSON: treść zestawu egzaminacyjnego
  przebieg  TEXT NOT NULL DEFAULT '[]',      -- JSON: transkrypcja egzaminu
  punkty    INTEGER NOT NULL DEFAULT 0,
  maks      INTEGER NOT NULL DEFAULT 30,
  szczegoly TEXT NOT NULL DEFAULT '',        -- JSON: rozbicie punktów, błędy, wskazówki
  czas_sek  INTEGER NOT NULL DEFAULT 0,
  status    TEXT NOT NULL DEFAULT 'w-toku',  -- w-toku | zakonczony
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_matura_user ON matura(user_id, data);

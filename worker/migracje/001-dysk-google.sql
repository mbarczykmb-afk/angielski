-- ============================================================
-- Migracja 001 — kopie zapasowe na Dysku Google
--
-- Uruchom TYLKO jeśli baza powstała przed dodaniem tej funkcji.
-- Przy świeżej instalacji schema.sql zawiera już te kolumny i tabelę,
-- a ta migracja zgłosi "duplicate column name" — to znaczy, że jest zbędna.
--
--   npx wrangler d1 execute angielski-ai --remote --file=./migracje/001-dysk-google.sql
-- ============================================================

ALTER TABLE users ADD COLUMN dysk_refresh TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN dysk_folder  TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN dysk_email   TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS oauth_state (
  state     TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  utworzono INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

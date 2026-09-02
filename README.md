# Angielski AI

Aplikacja do nauki angielskiego **przez rozmowę**. Najpierw ocenia Twój poziom, potem prowadzi
dzień po dniu przez 30 lekcji konwersacyjnych z lektorem AI — z mikrofonem, lektorem czytającym
odpowiedzi i powtórkami słówek.

Działa jak Duolingo: passa dni, XP, plan. Ale zamiast klikania w kafelki — realna rozmowa.

---

## Jak to działa

1. **Test poziomujący** — 12 zadań (wybór + pytania otwarte, na które możesz *odpowiedzieć głosem*).
   AI ustala poziom CEFR (A1–C1), wypisuje mocne i słabe strony.
2. **Plan 30 dni** — układany pod Twój poziom i konkretnie pod Twoje braki. Każdy dzień to jeden
   temat rozmowy z życia codziennego lub pracy.
3. **Lekcja dnia** — 8 słówek, 3 zwroty do użycia i **rozmowa z AI w roli**: barista, rekruter,
   kolega z pracy. Mówisz do mikrofonu, AI odpowiada głosem, błędy poprawia z boku, nie przerywając
   rozmowy.
4. **Podsumowanie** — ocena wypowiedzi, co poszło dobrze, co poprawić, plus 3–6 zwrotów,
   których Ci zabrakło, wrzuconych od razu do powtórek.
5. **Powtórki** — fiszki w systemie Leitnera (6 pudełek, odstępy 1–32 dni).

---

## Architektura

```
Telefon (PWA)  ──HTTPS──►  Cloudflare Worker  ──►  Claude API
   GitHub Pages                    │
                                   └──►  D1 (SQLite) — profile, plan, postępy, kopie zapasowe
```

**Dlaczego tak, a nie Google Apps Script:** GAS ma dzienny limit 90 minut czasu wykonania skryptów
**wspólny dla wszystkich projektów na koncie**. Aplikacja konwersacyjna trzyma wykonanie przez
kilka sekund na każdą turę rozmowy, więc zjadałaby ten budżet pozostałym apkom. Do tego UI
Apps Script renderuje się w iframe Google bez uprawnienia `allow="microphone"`, co psuje
rozpoznawanie mowy — czyli akurat to, na czym tu najbardziej zależy.

Darmowy plan Cloudflare to 100 000 zapytań dziennie i 5 GB w D1 — przy tym użyciu nie do wyczerpania.

**Klucz API nigdy nie trafia do telefonu.** Siedzi w sekrecie Workera; przeglądarka rozmawia
wyłącznie z Workerem.

---

## Wdrożenie

Potrzebne: konto Cloudflare (darmowe), konto Anthropic z kluczem API, Node.js 18+.

### 1. Backend

```bash
cd worker
npm install
npx wrangler login                      # otworzy przeglądarkę do autoryzacji
```

Utwórz bazę — komenda wypisze `database_id`:

```bash
npx wrangler d1 create angielski-ai
```

Wklej ten identyfikator do `worker/wrangler.toml` w miejsce `WKLEJ_TUTAJ_ID_BAZY`, potem:

```bash
npx wrangler d1 execute angielski-ai --remote --file=./schema.sql   # tworzy tabele
npx wrangler secret put ANTHROPIC_API_KEY                           # klucz z console.anthropic.com
npx wrangler secret put KOD_REJESTRACJI                             # dowolne hasło, patrz niżej
npx wrangler deploy
```

Ostatnia komenda wypisze adres, np. `https://angielski-ai.twoj-login.workers.dev`. **Zapisz go.**

Sprawdź, czy stoi:

```bash
curl https://angielski-ai.twoj-login.workers.dev/api/health
# {"ok":true,"usluga":"angielski-ai","baza":true,"klucz":true,...}
```

Jeśli `"klucz":false` — sekret się nie zapisał, powtórz `wrangler secret put`.

> **`KOD_REJESTRACJI` jest opcjonalny, ale ustaw go.** Adres Workera jest publiczny. Bez tego kodu
> ktoś, kto go znajdzie, może założyć profil i uczyć się angielskiego za Twoje pieniądze.
> Kod podaje się raz, przy zakładaniu profilu.

### 2. Frontend

W repozytorium na GitHubie: **Settings → Pages → Source: GitHub Actions**.

Po scaleniu zmian do gałęzi głównej workflow `.github/workflows/pages.yml` opublikuje katalog `web/`
pod adresem `https://mbarczykmb-afk.github.io/angielski/`.

Domknij CORS — w `worker/wrangler.toml` zamień:

```toml
DOZWOLONY_ORIGIN = "https://mbarczykmb-afk.github.io"
```

i wgraj ponownie: `npx wrangler deploy`.

### 3. Instalacja na Galaxy S20

1. Otwórz `https://mbarczykmb-afk.github.io/angielski/` w **Chrome** (nie w Samsung Internet —
   rozpoznawanie mowy działa tam gorzej).
2. Wklej adres Workera, dotknij **Połącz**.
3. Załóż profil (imię, PIN, kod rejestracji).
4. Menu **⋮ → Zainstaluj aplikację** (albo *Dodaj do ekranu głównego*).
5. Uruchom z ikony na pulpicie — otworzy się na pełnym ekranie, bez paska przeglądarki.
6. Przy pierwszym dotknięciu mikrofonu Chrome zapyta o zgodę — **Zezwól**.

Rozpoznawanie mowy wymaga HTTPS. GitHub Pages daje je z automatu, więc mikrofon zadziała.

---

## Koszty

Cloudflare i GitHub Pages: **0 zł**. Płacisz wyłącznie za wywołania modelu:

| Co | Model | Kiedy |
|---|---|---|
| Tury rozmowy | Haiku 4.5 | co wiadomość — szybki, żeby nie było pauz w konwersacji |
| Ocena poziomu, plan 30 dni, materiał lekcji, podsumowanie | Opus 5 | rzadko, ale musi być dobre |

Przy codziennej nauce po ~15 minut to rząd wielkości **kilkunastu złotych miesięcznie**.
W **Więcej → Model rozmowy** możesz przełączyć tury rozmowy na Opus 5 — naturalniejsza rozmowa
i lepsze korekty, ale kilkukrotnie drożej.

---

## Kopie zapasowe

Postępy zapisują się **automatycznie po każdej lekcji** i po ocenie poziomu. Trzymane są ostatnie
20 migawek na profil.

W **Więcej → Kopia zapasowa**:

- **Zrób kopię teraz** — migawka na żądanie
- **Pobierz plik z postępami** — pełny eksport JSON do telefonu (wrzuć go sobie na Dysk)
- **Wczytaj z pliku** — przywrócenie; przed nadpisaniem robi migawkę awaryjną, więc nieudany import
  nie kasuje postępów
- **Przywróć** przy dowolnej migawce z listy

PIN nigdy nie trafia do pliku eksportu — kopię możesz spokojnie gdziekolwiek przechować.

---

## Struktura

```
web/                   PWA (GitHub Pages)
  index.html           szkielet: logowanie, test, aplikacja
  app.css              ciemny motyw
  sw.js                service worker — instalacja i praca bez sieci
  js/
    rdzen.js           stan globalny, nawigacja, komunikaty
    api.js             komunikacja z Workerem
    mowa.js            mikrofon i lektor (Web Speech API)
    logowanie.js       profile, PIN, rejestracja
    test.js            test poziomujący
    dzis.js            widok główny, plan 30 dni
    rozmowa.js         czat z lektorem AI
    slowa.js           fiszki Leitnera
    postep.js          statystyki i wykres XP
    ustawienia.js      profil, mowa, kopie zapasowe

worker/                backend (Cloudflare)
  src/
    index.js           router HTTP + CORS
    pomoc.js           daty, sanityzacja, błędy
    ai.js              wywołania Claude API
    auth.js            profile, PIN (PBKDF2), sesje
    nauka.js           ocena, plan, lekcja, rozmowa, słówka
    kopie.js           kopie zapasowe i przywracanie
  schema.sql           schemat D1
  test/logika.test.mjs testy dat, parsowania i Leitnera

tools/ikony.py         generator ikon PWA
```

---

## Rozwój

```bash
cd worker
npm test                                            # testy logiki
npx wrangler d1 execute angielski-ai --local --file=./schema.sql
npx wrangler dev                                    # backend na localhost:8787
```

Frontend to statyczne pliki — `python3 -m http.server 8080 --directory web` wystarczy.
W aplikacji podaj wtedy adres `http://127.0.0.1:8787`.

Po każdej zmianie plików w `web/` podnieś `WERSJA` w `web/sw.js`, inaczej telefon zostanie
przy starej wersji z pamięci podręcznej.

---

## Rozwiązywanie problemów

| Objaw | Przyczyna |
|---|---|
| „Nie mogę połączyć się z serwerem" | Zły adres Workera albo `DOZWOLONY_ORIGIN` nie zgadza się z adresem strony |
| „Worker nie ma klucza API" | Brak sekretu — `npx wrangler secret put ANTHROPIC_API_KEY` |
| Mikrofon nie reaguje | Nie Chrome, brak HTTPS albo odrzucona zgoda (Chrome → ustawienia strony → Mikrofon) |
| Lektor milczy | Wyłączony w *Więcej → Mowa*, albo telefon jest wyciszony |
| Aplikacja pokazuje starą wersję | Podnieś `WERSJA` w `web/sw.js` i wgraj ponownie |
| „Limit zapytań przekroczony" | Limit po stronie Anthropic — odczekaj chwilę |

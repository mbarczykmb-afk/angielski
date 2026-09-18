@echo off
chcp 65001 >nul
setlocal
title Angielski AI - wdrozenie backendu

rem ============================================================
rem  WDROZENIE BACKENDU JEDNYM KLIKIEM
rem
rem  Ten skrypt nie korzysta z plikow lezacych obok niego. Za kazdym
rem  uruchomieniem pobiera swiezy kod prosto z GitHuba do wlasnego
rem  katalogu roboczego i wdraza wlasnie jego.
rem
rem  Powod jest konkretny: wczesniej zdarzylo sie wdrozyc stary kod
rem  z nieaktualnej paczki ZIP i poltora dnia poszlo na szukanie bledu,
rem  ktorego dawno juz nie bylo w repozytorium. Tak sie to nie powtorzy -
rem  nie ma znaczenia, gdzie ten plik lezy ani jak stary jest.
rem
rem  Uruchom dwuklikiem. Mozesz go trzymac chocby na pulpicie.
rem ============================================================

set "REPO=mbarczykmb-afk/angielski"
set "GALAZ=claude/english-learning-ai-app-kptsvl"
set "ADRES=https://angielski-ai.m-barczyk-mb.workers.dev"
set "ROBOCZY=%LOCALAPPDATA%\angielski-ai-wdrozenie"

echo.
echo ============================================================
echo   ANGIELSKI AI - wdrozenie backendu
echo ============================================================
echo.

rem ------------------------------------------------------------
rem  [0/5] Czy komputer ma czym pracowac
rem ------------------------------------------------------------

where curl >nul 2>&1
if errorlevel 1 (
  echo [BLAD] Nie znalazlem programu curl.
  echo.
  echo curl jest czescia Windowsa od wersji 10. Jesli go nie ma,
  echo Windows jest bardzo stary i trzeba wdrozyc recznie.
  echo.
  pause
  exit /b 1
)

where tar >nul 2>&1
if errorlevel 1 (
  echo [BLAD] Nie znalazlem programu tar.
  echo.
  echo tar jest czescia Windowsa od wersji 10. Jesli go nie ma,
  echo Windows jest bardzo stary i trzeba wdrozyc recznie.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [BLAD] Nie znalazlem Node.js.
  echo.
  echo Zainstaluj go z https://nodejs.org - wersja LTS, domyslne opcje.
  echo Potem uruchom ten plik jeszcze raz.
  echo.
  pause
  exit /b 1
)

echo [0/5] Node.js, curl i tar sa na miejscu.
echo.

rem ------------------------------------------------------------
rem  [1/5] Czysty katalog roboczy
rem ------------------------------------------------------------

if "%LOCALAPPDATA%"=="" (
  echo [BLAD] System nie podal sciezki LOCALAPPDATA. Przerywam dla bezpieczenstwa.
  echo.
  pause
  exit /b 1
)

echo [1/5] Przygotowuje katalog roboczy...
if exist "%ROBOCZY%" rd /s /q "%ROBOCZY%"
mkdir "%ROBOCZY%" 2>nul
cd /d "%ROBOCZY%"
if errorlevel 1 (
  echo [BLAD] Nie moge utworzyc katalogu roboczego:
  echo    %ROBOCZY%
  echo.
  pause
  exit /b 1
)
echo.

rem ------------------------------------------------------------
rem  [2/5] Pobranie aktualnego kodu
rem ------------------------------------------------------------

echo [2/5] Pobieram aktualny kod z GitHuba...
echo.

curl -fL -o "kod.zip" "https://github.com/%REPO%/archive/refs/heads/%GALAZ%.zip"

if errorlevel 1 (
  echo.
  echo Pierwsza proba nie wyszla. Ponawiam z pominieciem sprawdzania
  echo odwolania certyfikatu - na Windowsie blokuje je zwykle antywirus
  echo skanujacy polaczenia HTTPS.
  echo.
  curl -fL --ssl-no-revoke -o "kod.zip" "https://github.com/%REPO%/archive/refs/heads/%GALAZ%.zip"
  if errorlevel 1 (
    echo.
    echo [BLAD] Nie udalo sie pobrac kodu z GitHuba.
    echo.
    echo Sprawdz polaczenie z internetem. Jesli dziala, przyczyna moze byc
    echo antywirus - wylacz na chwile skanowanie HTTPS i sprobuj ponownie.
    echo.
    pause
    exit /b 1
  )
)

echo.
rem Gdyby po poprzednim uruchomieniu cos zostalo, usuwamy to teraz.
rem Inaczej ponizsza petla moglaby wybrac stary katalog zamiast swiezego.
for /d %%D in ("%ROBOCZY%\angielski-*") do rd /s /q "%%D"

echo Rozpakowuje...
tar -xf "kod.zip"
if errorlevel 1 (
  echo.
  echo [BLAD] Nie udalo sie rozpakowac pobranej paczki.
  echo.
  pause
  exit /b 1
)

rem Katalog z paczki GitHuba nazywa sie od repozytorium i galezi,
rem a ukosniki w nazwie galezi zamieniaja sie na myslniki. Zamiast
rem zgadywac te nazwe, bierzemy jedyny katalog, ktory tam powstal.
set "KOD="
for /d %%D in ("%ROBOCZY%\angielski-*") do set "KOD=%%D"

if "%KOD%"=="" (
  echo [BLAD] Po rozpakowaniu nie widze katalogu z kodem.
  echo.
  pause
  exit /b 1
)

if not exist "%KOD%\worker\package.json" (
  echo [BLAD] W pobranym kodzie brakuje pliku worker\package.json.
  echo.
  pause
  exit /b 1
)

cd /d "%KOD%\worker"
echo Kod pobrany.
echo.

rem ------------------------------------------------------------
rem  [3/5] Zaleznosci i testy
rem ------------------------------------------------------------

echo [3/5] Instaluje zaleznosci. To potrwa kilkadziesiat sekund...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [BLAD] Instalacja zaleznosci nie powiodla sie - patrz komunikat powyzej.
  echo.
  pause
  exit /b 1
)

echo.
echo Uruchamiam testy przed wdrozeniem...
echo.
call npm test
if errorlevel 1 (
  echo.
  echo [BLAD] Testy nie przeszly. NIE wdrazam - na serwerze zostaje
  echo poprzednia, dzialajaca wersja.
  echo.
  echo Pokaz mi ten ekran, to poprawie kod.
  echo.
  pause
  exit /b 1
)
echo.

rem ------------------------------------------------------------
rem  [4/5] Wdrozenie
rem ------------------------------------------------------------

echo [4/5] Wdrazam Workera na Cloudflare...
echo.
echo Jesli otworzy sie przegladarka z prosba o zalogowanie do Cloudflare -
echo zaloguj sie i zatwierdz dostep. To zdarza sie raz na jakis czas.
echo.

call npx wrangler deploy
if errorlevel 1 (
  echo.
  echo [BLAD] Wdrozenie nie powiodlo sie - patrz komunikat powyzej.
  echo.
  echo Najczestsze przyczyny:
  echo   - wygasle logowanie: uruchom w tym oknie  npx wrangler login
  echo   - brak internetu albo blokada antywirusa
  echo.
  pause
  exit /b 1
)

rem ------------------------------------------------------------
rem  [5/5] Sprawdzenie, czy backend faktycznie wstal
rem ------------------------------------------------------------

echo.
echo [5/5] Sprawdzam, czy backend odpowiada...
echo.

curl -s --ssl-no-revoke "%ADRES%/api/health" > "%TEMP%\ai-health.txt" 2>nul

if not exist "%TEMP%\ai-health.txt" (
  echo [UWAGA] Nie udalo sie odpytac backendu z tego komputera.
  echo Otworz recznie w przegladarce:
  echo    %ADRES%/api/health
  echo.
  pause
  exit /b 0
)

echo ------------------------------------------------------------
echo   Odpowiedz backendu:
echo.
type "%TEMP%\ai-health.txt"
echo.
echo.
echo ------------------------------------------------------------

rem Znacznik wersji zawiera nazwe modulu, wiec jego obecnosc dowodzi, ze na
rem serwerze jest wlasnie ten kod, ktory przed chwila wdrozylismy - a nie
rem jakis starszy, ktory tam lezal.
rem
rem Bez skokow goto, bez etykiet i bez nawiasow w wypisywanym tekscie:
rem kazda z tych rzeczy potrafi w .bat zawiesc przez drobiazg.
findstr /c:"usluga" "%TEMP%\ai-health.txt" >nul 2>&1
if errorlevel 1 (
  echo   [UWAGA] Backend odpowiedzial, ale nie tak, jak powinien.
  echo   Pokaz mi tresc powyzej, to sprawdze, co sie stalo.
) else (
  echo   Backend dziala.
  echo.
  findstr /c:"matura" "%TEMP%\ai-health.txt" >nul 2>&1
  if errorlevel 1 (
    echo   [UWAGA] Wersja na serwerze nie wyglada na te z modulem matury.
    echo   Pokaz mi ekran, to sprawdze, co poszlo nie tak.
  ) else (
    echo   Modul matury jest na serwerze. Wszystko sie zgadza.
  )
  echo.
  echo   Sprawdz jeszcze w odpowiedzi powyzej:
  echo      "baza"   ma byc true
  echo      "klucz"  ma byc true
  echo.
  echo   Jesli "klucz" jest false, wykonaj w tym oknie:
  echo      npx wrangler secret put ANTHROPIC_API_KEY
  echo.
  echo   Opcjonalnie - lepsze zdjecia w zadaniu 2 na maturze.
  echo   Darmowy klucz bierzesz z pexels.com/api, potem:
  echo      npx wrangler secret put PEXELS_API_KEY
)

del "%TEMP%\ai-health.txt" >nul 2>&1

echo ------------------------------------------------------------
echo.
echo Gotowe. Otworz aplikacje w telefonie:
echo    https://mbarczykmb-afk.github.io/angielski/
echo.
echo W aplikacji: zakladka Dzis, na gorze przelacznik "Matura ustna".
echo.
pause

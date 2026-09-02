@echo off
chcp 65001 >nul
setlocal
title Angielski AI - wdrozenie

rem ============================================================
rem  Wdrozenie backendu jednym klikiem.
rem  Polozenie: katalog worker. Uruchom dwuklikiem.
rem ============================================================

rem Adres Workera - podmien, jesli kiedys sie zmieni
set "ADRES=https://angielski-ai.m-barczyk-mb.workers.dev"

rem Przechodzimy do katalogu skryptu, zeby dwuklik dzialal z dowolnego miejsca
cd /d "%~dp0"

echo.
echo ============================================================
echo   ANGIELSKI AI - wdrozenie backendu
echo ============================================================
echo.

if not exist "package.json" (
  echo [BLAD] Nie widze pliku package.json.
  echo.
  echo Ten skrypt musi lezec w katalogu "worker" razem z plikami
  echo package.json, wrangler.toml i folderem src.
  echo.
  pause
  exit /b 1
)

if not exist "src\index.js" (
  echo [BLAD] Brakuje folderu src z kodem.
  echo.
  pause
  exit /b 1
)

findstr /c:"WKLEJ_TUTAJ_ID_BAZY" wrangler.toml >nul 2>&1
if not errorlevel 1 (
  echo [BLAD] W pliku wrangler.toml nadal jest WKLEJ_TUTAJ_ID_BAZY.
  echo.
  echo Wklej tam Database ID bazy D1. Podejrzysz je komenda:
  echo    npx wrangler d1 list
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/3] Brak zaleznosci - instaluje. To potrwa kilkanascie sekund...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [BLAD] Instalacja zaleznosci nie powiodla sie.
    echo Sprawdz, czy projekt NIE lezy na Dysku Google - to najczestsza przyczyna.
    echo.
    pause
    exit /b 1
  )
  echo.
) else (
  echo [1/3] Zaleznosci na miejscu.
  echo.
)

echo [2/3] Wdrazam Workera...
echo.
call npx wrangler deploy
if errorlevel 1 (
  echo.
  echo [BLAD] Wdrozenie nie powiodlo sie - patrz komunikat powyzej.
  echo.
  echo Najczestsze przyczyny:
  echo   - wygasle logowanie: uruchom  npx wrangler login
  echo   - bledne Database ID w wrangler.toml
  echo.
  pause
  exit /b 1
)

echo.
echo [3/3] Sprawdzam, czy backend odpowiada...
echo.

rem --ssl-no-revoke omija blad sprawdzania odwolania certyfikatu,
rem ktory na Windowsie wywoluje zwykle antywirus skanujacy HTTPS
curl -s --ssl-no-revoke "%ADRES%/api/health" > "%TEMP%\ai-health.txt" 2>nul

if errorlevel 1 (
  echo [UWAGA] Nie udalo sie odpytac backendu z tego komputera.
  echo Otworz recznie w przegladarce:  %ADRES%/api/health
  echo.
  pause
  exit /b 0
)

echo ------------------------------------------------------------
echo   Odpowiedz backendu:
echo.
type "%TEMP%\ai-health.txt"
del "%TEMP%\ai-health.txt" >nul 2>&1
echo.
echo.
echo ------------------------------------------------------------
echo   Powyzej maja byc trzy rzeczy:
echo      "ok":true      - Worker odpowiada
echo      "baza":true    - baza D1 podpieta
echo      "klucz":true   - klucz Anthropic ustawiony
echo.
echo   Jesli "klucz" jest false, wykonaj:
echo      npx wrangler secret put ANTHROPIC_API_KEY
echo ------------------------------------------------------------
echo.
echo Gotowe. Otworz aplikacje:
echo   https://mbarczykmb-afk.github.io/angielski/
echo.
pause

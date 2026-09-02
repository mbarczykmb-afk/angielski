@echo off
chcp 65001 >nul
title Angielski AI - logi na zywo

rem ============================================================
rem  Podglad tego, co dzieje sie w Workerze, na zywo.
rem  Uruchom dwuklikiem, potem wywolaj blad w aplikacji.
rem ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   ANGIELSKI AI - logi na zywo
echo ============================================================
echo.
echo To okno pokazuje, co dzieje sie w Workerze w tej chwili.
echo.
echo   1. Zostaw je otwarte.
echo   2. Przejdz do aplikacji i wywolaj problem
echo      ^(np. kliknij "Zaczynamy" w tescie^).
echo   3. Wroc tutaj - pojawia sie linie z bledem.
echo.
echo Szukasz linii zaczynajacej sie od "Anthropic 400 dla modelu".
echo To, co jest po dwukropku, to prawdziwa przyczyna.
echo.
echo Zamknij okno klawiszami Ctrl+C.
echo ------------------------------------------------------------
echo.

call npx wrangler tail

echo.
pause

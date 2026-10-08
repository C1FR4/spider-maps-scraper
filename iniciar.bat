@echo off
title Spider Maps Scraper - Panel Web
cd /d "%~dp0"

echo ===================================================
echo           SPIDER MAPS SCRAPER - PERU
echo ===================================================
echo Iniciando servidor local y abriendo panel web...
echo.

node src/server.js

if errorlevel 1 (
    echo.
    echo Ocurrio un error al iniciar. Verifica que Node.js este instalado.
    pause
)

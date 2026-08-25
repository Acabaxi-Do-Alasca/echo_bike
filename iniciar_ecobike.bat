@echo off
title EcoBike
cd /d "%~dp0"

start "EcoBike Server" "%~dp0server\server.exe" "%~dp0."

timeout /t 2 /nobreak >nul

start "" "http://localhost:8642/index.html"

@echo off
rem Abre o MedBridge (servidor local + site) numa janela propria do Windows.
rem De dois cliques neste arquivo. Deixe a janela aberta enquanto usar o site;
rem fechar a janela desliga o MedBridge.
title MedBridge - deixe esta janela aberta
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O pnpm nao foi encontrado. Instale o Node 22 e o pnpm ^(veja AGENTS.md^).
  echo.
  pause
  exit /b 1
)

echo.
echo  Iniciando o MedBridge... isso leva cerca de 1 minuto.
echo  O navegador abre sozinho em http://localhost:5173 quando estiver pronto.
echo  Para desligar, feche esta janela.
echo.

rem Opens the browser once the site answers (checks every 3 s for up to ~3 min).
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:5173 | Out-Null; Start-Process 'http://localhost:5173'; break } catch { Start-Sleep -Seconds 3 } }"

call pnpm run dev:all

echo.
echo  O MedBridge foi desligado.
pause

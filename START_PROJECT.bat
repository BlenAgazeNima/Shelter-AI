@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Please run SETUP_WINDOWS.bat first.
  pause
  exit /b 1
)
if not exist "frontend\node_modules" (
  echo Please run SETUP_WINDOWS.bat first.
  pause
  exit /b 1
)
if not exist "backend\videos\.real_footage_installed" (
  echo Real footage has not been installed yet. Downloading it now...
  ".venv\Scripts\python.exe" tools\download_real_footage.py
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "Project 1 GDRFA AI Backend" cmd /k "cd /d %~dp0 && .venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
timeout /t 6 /nobreak >nul
start "Project 1 GDRFA React Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 127.0.0.1"
timeout /t 4 /nobreak >nul
start http://127.0.0.1:5173
echo Project started. Keep both terminal windows open.

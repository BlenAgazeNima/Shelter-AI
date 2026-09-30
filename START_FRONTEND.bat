@echo off
setlocal
cd /d "%~dp0"
title GDRFA Shelter Services
if exist "%LocalAppData%\Programs\Python\Launcher\py.exe" (
  "%LocalAppData%\Programs\Python\Launcher\py.exe" -3 run_frontend.py
) else (
  python run_frontend.py
)
pause

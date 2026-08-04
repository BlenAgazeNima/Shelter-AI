@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo GDRFA AI Shelter - Real Footage Importer
echo ================================================

if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" tools\import_real_footage.py
) else (
  py -3 tools\import_real_footage.py
)

if errorlevel 1 (
  echo.
  echo The importer stopped with an error. Read the message above.
)

echo.
pause

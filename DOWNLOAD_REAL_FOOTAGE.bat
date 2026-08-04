@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Please run SETUP_WINDOWS.bat first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" tools\download_real_footage.py --force
if errorlevel 1 (
  echo.
  echo The download did not finish. Check your internet connection and try again.
  pause
  exit /b 1
)
echo.
echo Real footage is installed successfully.
pause

@echo off
setlocal
cd /d "%~dp0"
if not exist ".runtime\ai\Scripts\python.exe" (
  py -3 -m venv .runtime\ai
  if errorlevel 1 goto fail
)
".runtime\ai\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto fail
echo YOLO installed. Stop the backend with Ctrl+C and run START_PROJECT.bat again.
echo If .env contains SHELTER_ENABLE_AI=0, change it to SHELTER_ENABLE_AI=1.
pause
exit /b 0
:fail
echo Setup failed. Check the error above.
pause
exit /b 1

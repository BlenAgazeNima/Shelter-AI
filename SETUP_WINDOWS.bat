@echo off
setlocal
cd /d "%~dp0"
echo The backend is installed automatically on first launch.
echo This project includes its built frontend. Node.js is not required to run it.
call START_PROJECT.bat

@echo off
setlocal
cd /d "%~dp0"

title Project 1 - GDRFA AI Shelter Setup

echo ========================================================
echo Project 1 - GDRFA AI Shelter - One-time setup
echo Python 3.14 configuration
echo ========================================================
echo.

where py >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python launcher was not found.
    echo Install Python and ensure the py command is available.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js and npm were not found.
    echo Install Node.js LTS and reopen this window.
    pause
    exit /b 1
)

echo Checking Python 3.14...
py -3.14 --version >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python 3.14 was not found.
    echo Run: py -0p
    echo to check installed Python versions.
    pause
    exit /b 1
)

echo.
echo [1/6] Creating Python 3.14 virtual environment...

if not exist ".venv\Scripts\python.exe" (
    py -3.14 -m venv .venv

    if errorlevel 1 (
        echo ERROR: Could not create the virtual environment.
        pause
        exit /b 1
    )
) else (
    echo Existing virtual environment found.
)

echo.
echo Python environment:
".venv\Scripts\python.exe" --version

echo.
echo [2/6] Updating pip...

".venv\Scripts\python.exe" -m pip install --upgrade pip

if errorlevel 1 goto :failed

echo.
echo [3/6] Installing Python backend packages...

".venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"

if errorlevel 1 goto :failed

echo.
echo [4/6] Installing React frontend packages...

pushd frontend
call npm install

if errorlevel 1 (
    popd
    goto :failed
)

popd

echo.
echo [5/6] Downloading real video footage...

if not exist "tools\download_real_footage.py" (
    echo ERROR: tools\download_real_footage.py was not found.
    goto :failed
)

".venv\Scripts\python.exe" "tools\download_real_footage.py"

if errorlevel 1 goto :failed

echo.
echo [6/6] Checking downloaded videos...

if not exist "backend\videos\dining-hall.mp4" (
    echo ERROR: dining-hall.mp4 was not downloaded.
    goto :failed
)

if not exist "backend\videos\corridor.mp4" (
    echo ERROR: corridor.mp4 was not downloaded.
    goto :failed
)

if not exist "backend\videos\fall-detection.mp4" (
    echo ERROR: fall-detection.mp4 was not downloaded.
    goto :failed
)

if not exist "backend\videos\recreation-room.mp4" (
    echo ERROR: recreation-room.mp4 was not downloaded.
    goto :failed
)

echo.
echo ========================================================
echo SETUP COMPLETE
echo ========================================================
echo.
echo The following videos are ready:
echo - dining-hall.mp4
echo - corridor.mp4
echo - fall-detection.mp4
echo - recreation-room.mp4
echo.
echo Now double-click START_PROJECT.bat.
echo.

pause
exit /b 0

:failed
echo.
echo ========================================================
echo SETUP FAILED
echo ========================================================
echo Read the error shown above.
echo.
pause
exit /b 1
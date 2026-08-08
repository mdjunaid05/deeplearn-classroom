@echo off
title DeepLearn Smart Virtual Classroom Launcher
echo ======================================================================
echo   DeepLearn Smart Virtual Classroom System Launcher
echo ======================================================================
echo.

set "ROOT_DIR=%~dp0"

REM Determine project subdirectories
if exist "%ROOT_DIR%deeplearn-classroom\backend" (
    set "BACKEND_DIR=%ROOT_DIR%deeplearn-classroom\backend"
    set "FRONTEND_DIR=%ROOT_DIR%deeplearn-classroom\frontend"
) else if exist "%ROOT_DIR%backend" (
    set "BACKEND_DIR=%ROOT_DIR%backend"
    set "FRONTEND_DIR=%ROOT_DIR%frontend"
) else (
    echo [ERROR] Project backend and frontend directories could not be found!
    echo Please make sure run.bat is located in the project directory.
    pause
    exit /b 1
)

echo [1/2] Starting Flask Backend Server...
echo       Backend dir: %BACKEND_DIR%

REM Create a temporary launcher script for the backend to avoid quoting issues
set "BACKEND_LAUNCHER=%TEMP%\deeplearn_backend_launcher.bat"
(
    echo @echo off
    echo title DeepLearn Backend
    echo cd /d "%BACKEND_DIR%"
    echo if exist venv\Scripts\activate.bat call venv\Scripts\activate.bat
    echo python app.py
    echo echo.
    echo echo [Backend exited. Press any key to close.]
    echo pause
) > "%BACKEND_LAUNCHER%"
start "DeepLearn Backend" cmd /k "%BACKEND_LAUNCHER%"

REM Wait a moment for backend to start before launching frontend
timeout /t 3 /nobreak > nul

echo [2/2] Starting React Frontend Server...
echo       Frontend dir: %FRONTEND_DIR%

REM Create a temporary launcher script for the frontend
set "FRONTEND_LAUNCHER=%TEMP%\deeplearn_frontend_launcher.bat"
(
    echo @echo off
    echo title DeepLearn Frontend
    echo cd /d "%FRONTEND_DIR%"
    echo npm run dev
    echo echo.
    echo echo [Frontend exited. Press any key to close.]
    echo pause
) > "%FRONTEND_LAUNCHER%"
start "DeepLearn Frontend" cmd /k "%FRONTEND_LAUNCHER%"

echo.
echo ======================================================================
echo   Services launched in separate windows:
echo   - Backend API:  http://localhost:5000
echo   - Frontend UI:  http://localhost:3000
echo ======================================================================
echo.
pause

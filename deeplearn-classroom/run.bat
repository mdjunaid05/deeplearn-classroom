@echo off
title DeepLearn Smart Virtual Classroom Launcher
echo ======================================================================
echo   DeepLearn Smart Virtual Classroom System Launcher
echo ======================================================================
echo.

set "ROOT_DIR=%~dp0"

REM Determine project subdirectories
if exist "%ROOT_DIR%backend" (
    set "BACKEND_DIR=%ROOT_DIR%backend"
    set "FRONTEND_DIR=%ROOT_DIR%frontend"
) else if exist "%ROOT_DIR%deeplearn-classroom\backend" (
    set "BACKEND_DIR=%ROOT_DIR%deeplearn-classroom\backend"
    set "FRONTEND_DIR=%ROOT_DIR%deeplearn-classroom\frontend"
) else (
    echo [ERROR] Project backend and frontend directories could not be found!
    pause
    exit /b 1
)

echo [1/2] Starting Flask Backend Server...
start "DeepLearn Backend" cmd /k "cd /d "%BACKEND_DIR%" && (if exist venv\Scripts\activate.bat call venv\Scripts\activate.bat) && python app.py"

echo [2/2] Starting React Frontend Server...
start "DeepLearn Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo ======================================================================
echo   Services launched in separate windows:
echo   - Backend API:  http://localhost:5000
echo   - Frontend UI:   http://localhost:5173 (or http://localhost:3000)
echo ======================================================================
echo.
pause

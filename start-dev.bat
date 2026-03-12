@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "VENV_ACTIVATE=%BACKEND_DIR%\.venv\Scripts\activate.bat"

if not exist "%VENV_ACTIVATE%" (
    echo [ERROR] Python virtual environment not found:
    echo         %VENV_ACTIVATE%
    pause
    exit /b 1
)

if not exist "%BACKEND_DIR%\run.py" (
    echo [ERROR] Backend entry file not found:
    echo         %BACKEND_DIR%\run.py
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo [ERROR] Frontend package.json not found:
    echo         %FRONTEND_DIR%\package.json
    pause
    exit /b 1
)

echo Starting backend...
start "scraping-app backend" cmd /k "cd /d ""%BACKEND_DIR%"" && call ""%VENV_ACTIVATE%"" && python run.py"

echo Starting frontend...
start "scraping-app frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev"

echo.
echo Backend and frontend are starting in separate windows.
exit /b 0

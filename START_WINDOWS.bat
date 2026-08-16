@echo off
title Saleh Order Ahead V4
cd /d "%~dp0"

echo.
echo ==========================================
echo   SALEH ORDER AHEAD V4 - LOCAL START
echo ==========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
  echo Python was not found.
  echo Install Python, then run this file again.
  pause
  exit /b 1
)

echo [1/2] Installing/checking required packages...
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Package installation failed.
  pause
  exit /b 1
)

echo.
echo [2/2] Starting the app...
echo Customer:   http://localhost:8000/
echo Management: http://localhost:8000/admin
echo Branch 1:   http://localhost:8000/branch/1
echo.
echo Keep this black window OPEN while testing.
echo Press CTRL+C here when you want to stop the app.
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8000/"
python -m uvicorn app:app --host 0.0.0.0 --port 8000

echo.
echo Server stopped.
pause

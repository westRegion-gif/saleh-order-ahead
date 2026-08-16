@echo off
cd /d "%~dp0"
echo.
echo WARNING: This deletes local users, orders, reports and inventory changes.
echo It returns the app to first-time Admin Setup.
echo.
set /p answer=Type RESET to continue: 
if /I not "%answer%"=="RESET" (
  echo Cancelled.
  pause
  exit /b 0
)
if exist saleh.db del /f /q saleh.db
echo Local demo database deleted.
echo Run START_WINDOWS.bat again.
pause

@echo off
setlocal

cd /d "%~dp0"

echo Checking Node.js availability...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install Node.js 18+ and rerun this file.
  pause
  exit /b 1
)

echo Installing backend and frontend dependencies...
call npm run setup-all
if errorlevel 1 goto :fail

echo Building frontend for production...
call npm run build-frontend
if errorlevel 1 goto :fail

echo Starting production server...
start "AppsForGood" cmd /k "cd /d \"%~dp0\" & npm run start-production"

echo Waiting for server startup...
timeout /t 3 /nobreak >nul

echo Opening http://localhost:3001
start "" "http://localhost:3001"

goto :eof

:fail
echo.
echo Startup failed.
pause
exit /b 1

@echo off
setlocal
cd /d "%~dp0"

title LIX SimOps

echo.
echo ============================================
echo          LIX SimOps Portable
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python was not found on this computer.
  echo This package expects 64-bit Python 3.13.
  pause
  exit /b 1
)

python -c "import sys,struct; raise SystemExit(0 if sys.version_info[:2] == (3,13) and struct.calcsize('P') * 8 == 64 else 1)"
if errorlevel 1 (
  echo ERROR: This portable package was prepared for 64-bit Python 3.13.
  echo Your installed Python is:
  python --version
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo First launch: creating a private Python environment in this folder...
  python -m venv .venv
  if errorlevel 1 goto :setup_error
)

if not exist ".venv\.simops_ready" (
  echo First launch: installing bundled Python packages locally.
  echo No administrator rights or internet package download should be needed.
  ".venv\Scripts\python.exe" -m pip install --no-index --find-links "%~dp0wheelhouse" -r "%~dp0portable-requirements.txt"
  if errorlevel 1 goto :setup_error
  type nul > ".venv\.simops_ready"
)

echo Checking the Endymion weather package...
".venv\Scripts\python.exe" scripts\validate_exercise_cache.py
if errorlevel 1 (
  echo.
  echo ERROR: The bundled exercise cache did not validate.
  echo Please copy this entire window and send it for troubleshooting.
  pause
  exit /b 1
)

echo.
echo SimOps is starting.
echo Local browser address: http://localhost:8000
echo.
echo Keep this window OPEN while using SimOps.
echo To stop SimOps later, click this window and press Ctrl+C.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"

".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
goto :eof

:setup_error
echo.
echo ERROR: The local SimOps environment could not be created.
echo No administrator changes were attempted.
echo Please copy this entire window and send it for troubleshooting.
pause
exit /b 1

@echo off
setlocal

rem CMD cannot use a UNC path as its current directory. pushd automatically
rem maps the package's UNC folder to a temporary drive letter when needed.
pushd "%~dp0"
if errorlevel 1 (
  echo ERROR: SimOps could not access the extracted package folder:
  echo "%~dp0"
  echo.
  echo Please copy this entire window and send it for troubleshooting.
  pause
  exit /b 1
)

title LIX SimOps

set "SIMOPS_HOST=127.0.0.1"
set "SIMOPS_CHECK_ONLY=0"
if /I "%~1"=="LAN" set "SIMOPS_HOST=0.0.0.0"
if /I "%~1"=="CHECK" set "SIMOPS_CHECK_ONLY=1"

rem Keep the Python environment on the local user profile even when the
rem portable package itself lives on a redirected/network drive.
set "SIMOPS_RUNTIME=%LOCALAPPDATA%\LIX-SimOps"
set "SIMOPS_VENV=%SIMOPS_RUNTIME%\venv-py313"

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
  popd
  exit /b 1
)

python -c "import sys,struct; raise SystemExit(0 if sys.version_info[:2] == (3,13) and struct.calcsize('P') * 8 == 64 else 1)"
if errorlevel 1 (
  echo ERROR: This portable package was prepared for 64-bit Python 3.13.
  echo Your installed Python is:
  python --version
  echo.
  pause
  popd
  exit /b 1
)

if not exist "%SIMOPS_RUNTIME%" (
  mkdir "%SIMOPS_RUNTIME%" >nul 2>nul
  if errorlevel 1 goto :setup_error
)

if not exist "%SIMOPS_VENV%\Scripts\python.exe" (
  echo First launch: creating a private Python environment under:
  echo %SIMOPS_VENV%
  python -m venv "%SIMOPS_VENV%"
  if errorlevel 1 goto :setup_error
)

for /f "usebackq delims=" %%H in (`python -c "import hashlib,pathlib; print(hashlib.sha256(pathlib.Path('portable-requirements.txt').read_bytes()).hexdigest())"`) do set "SIMOPS_REQ_HASH=%%H"
set "SIMOPS_READY=%SIMOPS_VENV%\.simops_ready_%SIMOPS_REQ_HASH%"

if not exist "%SIMOPS_READY%" (
  echo Installing or refreshing bundled Python packages locally.
  echo No administrator rights or internet package download should be needed.
  "%SIMOPS_VENV%\Scripts\python.exe" -m pip install --no-index --find-links "%CD%\wheelhouse" -r "%CD%\portable-requirements.txt"
  if errorlevel 1 goto :setup_error
  del /q "%SIMOPS_VENV%\.simops_ready_*" >nul 2>nul
  type nul > "%SIMOPS_READY%"
)

echo Checking whether port 8000 is available...
"%SIMOPS_VENV%\Scripts\python.exe" -c "import socket,sys; s=socket.socket(); host=sys.argv[1]; exec('try:\n s.bind((host,8000))\nexcept OSError:\n raise SystemExit(1)\nfinally:\n s.close()')" "%SIMOPS_HOST%"
if errorlevel 1 (
  echo.
  echo ERROR: Port 8000 is already in use on this computer.
  echo If SimOps is already running, use the existing browser session or stop the old server first.
  pause
  popd
  exit /b 1
)

echo Checking the Endymion weather package...
"%SIMOPS_VENV%\Scripts\python.exe" scripts\validate_exercise_cache.py
if errorlevel 1 (
  echo.
  echo ERROR: The bundled exercise cache did not validate.
  echo Please copy this entire window and send it for troubleshooting.
  pause
  popd
  exit /b 1
)

if "%SIMOPS_CHECK_ONLY%"=="1" (
  echo.
  echo Portable launcher preflight passed.
  popd
  exit /b 0
)

echo.
echo SimOps is starting.
echo Local browser address: http://localhost:8000
if "%SIMOPS_HOST%"=="0.0.0.0" (
  echo LAN mode is enabled on port 8000.
  echo Candidate participant addresses:
  "%SIMOPS_VENV%\Scripts\python.exe" -c "import socket; ips=sorted({x[4][0] for x in socket.getaddrinfo(socket.gethostname(),None,socket.AF_INET) if not x[4][0].startswith('127.')}); [print(f'  http://{ip}:8000') for ip in ips]"
)
echo.
echo Keep this window OPEN while using SimOps.
echo To stop SimOps later, click this window and press Ctrl+C.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"

"%SIMOPS_VENV%\Scripts\python.exe" -m uvicorn backend.app.main:app --host %SIMOPS_HOST% --port 8000
if errorlevel 1 (
  echo.
  echo ERROR: The SimOps server stopped unexpectedly.
  echo Please copy this entire window and send it for troubleshooting.
  pause
  popd
  exit /b 1
)
popd
goto :eof

:setup_error
echo.
echo ERROR: The local SimOps environment could not be created.
echo Runtime folder:
echo %SIMOPS_RUNTIME%
echo.
echo No administrator changes were attempted.
echo Please copy this entire window and send it for troubleshooting.
pause
popd
exit /b 1

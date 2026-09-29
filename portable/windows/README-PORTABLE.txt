LIX SIMOPS — PORTABLE WINDOWS PACKAGE
=====================================

This package is intended for managed Windows computers where Docker Desktop,
Node.js, or administrator-installed development tools are unavailable.

WHAT YOU NEED
-------------
- 64-bit Windows
- 64-bit Python 3.13 already installed and available as "python"
- Permission to create files inside this extracted folder
- A normal web browser

You do NOT need:
- Docker Desktop
- hardware virtualization
- Node.js or npm
- administrator credentials
- internet access for Python package installation

FIRST LAUNCH
------------
1. Extract the entire ZIP to a writable folder.
2. Double-click START_SIMOPS.bat.
3. The first launch creates a private .venv folder and installs Python
   dependencies from the bundled wheelhouse. Nothing is installed system-wide.
4. The bundled Endymion weather cache is validated automatically.
5. Your browser should open http://localhost:8000.
6. Keep the black START_SIMOPS window open while using the exercise.

STOPPING SIMOPS
---------------
Click the START_SIMOPS command window and press Ctrl+C.

OTHER WORKSTATIONS
------------------
The server listens on port 8000. Other computers can use
http://HOST-IP:8000 only if the office network and Windows security policy
allow those computers to reach the host. Do not disable enterprise firewall
or security controls to make this work; test with the local ITO/IT-approved
network path before the workshop.

PACKAGE CONTENTS
----------------
- backend/ and simulator/: Python SimOps server
- frontend/dist/: prebuilt participant/facilitator website
- scenarios/: Endymion exercise configuration
- data/cache/: validated participant weather package
- wheelhouse/: offline Python runtime dependencies
- scripts/validate_exercise_cache.py: cache integrity check
- BUILD_INFO.txt: source-case build metadata

The current package does not yet include externally reproduced LightningCast.

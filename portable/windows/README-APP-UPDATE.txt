LIX SIMOPS — APP-ONLY UPDATE
================================

WHAT THIS IS
------------
This artifact updates an EXISTING, already-working LIX SimOps portable install.
It is intentionally smaller and simpler than the full portable package.

It contains:
- backend/ and simulator/ application source
- scenarios/ participant exercise configuration
- frontend/dist/ prebuilt website
- scripts/validate_exercise_cache.py
- PACKAGE_INFO.txt and APP_UPDATE_INFO.txt

It intentionally DOES NOT contain:
- START_SIMOPS.bat or START_SIMOPS_LAN.bat
- a Python wheelhouse or bundled Python packages
- a weather cache
- executables, DLLs, PowerShell scripts, or compiled Python extensions
- facilitator-only source-case metadata

DO NOT USE THIS FOR A FIRST INSTALL
-----------------------------------
You must already have a working full portable install that has successfully
started before. The existing install supplies:
- START_SIMOPS.bat
- the private Python 3.13 environment under %LOCALAPPDATA%\LIX-SimOps
- the validated Endymion weather cache
- the offline wheelhouse

HOW TO APPLY THE UPDATE
-----------------------
1. Stop SimOps if it is running. Close the black START_SIMOPS command window
   or press Ctrl+C in that window.
2. Extract this artifact to a temporary folder.
3. Open the extracted LIX-SimOps update contents.
4. Copy the update contents into the folder that currently contains your
   existing START_SIMOPS.bat.
5. When Windows asks, choose to replace/overwrite files with the same names.
6. Do NOT delete the existing folder first. The update intentionally does not
   contain the wheelhouse, weather cache, launcher, or local Python environment.
7. Open PACKAGE_INFO.txt and confirm that app_commit matches the GitHub commit
   for the update you intended to install.
8. Start SimOps using your EXISTING START_SIMOPS.bat.

The normal launcher will validate the existing Endymion cache before starting.
If validation fails, stop and use a fresh full portable package rather than
trying to bypass the check.

SAFETY / TRACEABILITY
---------------------
This update is built by the same GitHub Actions workflow as the full portable
package. The workflow rejects facilitator-only historical source metadata and
also fails the build if this app-only update contains .bat, .cmd, .ps1, .exe,
.msi, .dll, .pyd, or .whl files.

This packaging format is meant to reduce unnecessary installer-like and compiled
content for routine application updates. It is not a way to disable or bypass
browser or enterprise security controls.

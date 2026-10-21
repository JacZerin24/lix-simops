# Workshop RAP sounding and base-velocity palette installation

## What changed

- `backend/app/services/meso_data.py` adds an **optional** case-blind RAP F00 KMSY sounding under **Meso -> Thermodynamics**. It is only visible when the separately provided PNG is installed.
- `frontend/src/pages/Mesoanalyst/index.tsx` offers an **Open full-resolution sounding** link.
- `backend/app/services/radar_data.py` reads the supplied `dl_BV-GRA2.pal` at runtime for the WebGL **Base Velocity (VEL)** display. The original radar gate-data cache is unchanged, as are REF, CC, and ZDR. Legacy PNG fallback radar frames retain the old colors.
- The mock shift-log Form URL is already configured in `scenarios/mardi-gras/event.yaml`.

**Source branch:** `feature/radar-operations-v1` (PR #10).

## Install on the existing Windows portable host

1. Stop SimOps and close its launcher's command window.
2. In GitHub Actions, run **Build Portable Windows SimOps** on `feature/radar-operations-v1`, with **app_only=true**.
3. After the workflow succeeds, download the **LIX-SimOps-App-Update** artifact. Extract it and open the inner `LIX-SimOps` folder.
4. Copy the **contents** of that folder into the existing SimOps folder that already contains `START_SIMOPS_LAN.bat` and the weather `data/cache` folder. Approve merging folders and overwriting matching app files. **Never delete the existing installation or data/cache first**. The app-only update contains no weather data.
5. Separately download the **Endymion_SimOps_Sounding_Asset.zip** artifact provided in the workshop conversation. Extract its `data` folder and merge it into that same installed `LIX-SimOps` folder. This adds only:
   `data/cache/mardi-gras-dss-001/meso/frames/rap_kmsy_sounding/KMSY_RAP_F00_20270206_1445CST.png`
6. Confirm that the installed `PACKAGE_INFO.txt` `app_commit` matches the commit produced by your new app-only workflow.
7. Restart using the **existing** `START_SIMOPS_LAN.bat` launcher.

## Final case-blind smoke test

- Create a new **disposable**, paused Endymion session at simulation **2:45 PM CST**.
- Join Meso. Under **Thermodynamics**, select **RAP F00 Sounding - KMSY**. Confirm the profile is visible, the header shows the simulated valid time, there is no original 2021 date, and **Open full-resolution sounding** opens an enlarged view.
- Join Radar. Compare VEL 0.5-degree display colors with `dl_BV-GRA2.pal`, and confirm REF/CC/ZDR still look correct.
- Join DSS. Check **Open Shift Log** opens the coworker-owned Google Form in a new tab and that **Mark Shift Log Updated** remains present.
- Leave the demo. Create a **new** session code for the official exercise; do not reuse the demo code.

## If the sounding does not appear

- Verify the filename and exact path above (it must not be nested inside an extra `LIX-SimOps` directory).
- Confirm you actually installed the latest app-only package, not only the GitHub source change.
- Restart the SimOps server after copying files.
- Ensure the Meso product is selected under **Thermodynamics** (not Guidance).

## Technical notes

The added sounding is a **static initial-condition reference**, not a time-varying sounding and not a new model forecast. The PNG's original meteorological plots and parameters were retained; only the case-identifying header was updated. The sounding is time-gated at `2027-02-06T20:45:00Z` (2:45 PM CST), matching the scenario start. The server only serves the asset when the file is installed and the session clock has reached its valid time.

The GitHub repository intentionally does not contain the image binary, prebuilt cache, or source-case metadata. The additional sounding ZIP installs one image without rewriting the existing radar or Meso manifests.

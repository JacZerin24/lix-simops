# Endymion optional Meso weather data (case-blind)

The Full Endymion Case Build `39713155828` intentionally produces
`endymion-case-cache-no-lightningcast`. The 21+21 authentic archived
LightningCast/LightningCast-MRMS image frames and the case-blind RAP KMSY
sounding were installed separately in the previous working SimOps package.

The full **Build Portable Windows SimOps** workflow now supports merging those
43 optional PNG assets during a fresh GitHub-hosted **full** packaging run,
without changing the newly rebuilt SAILS radar cache.

## One-time binary upload through GitHub's website

1. Download the verified 18 MB archive from the workshop conversation:
   **Endymion_LightningCast_Sounding_Restore.zip**.
2. Open this `weather-addons` folder on the
   **feature/radar-operations-v1** branch.
3. Select **Add file → Upload files** and upload exactly the ZIP above here,
   keeping its original filename. Commit it to the feature branch, not main.
   Do **not** upload `New folder.zip`; it includes stale application and cache
   files and is far larger than needed.
4. Confirm the repository now contains
   `weather-addons/Endymion_LightningCast_Sounding_Restore.zip`.

The verified archive is 18,831,901 bytes uncompressed within its ZIP container,
and has the exact SHA-256 hash:

```
bb8ec7c30b99f1232ef53ea94fbcf53740f822a8b30b7603403c23245c8fe328
```

The packaging workflow checks the SHA-256 of the *complete ZIP* before
extracting anything. It will refuse a modified, missing, or mismatched binary
rather than installing potentially corrupt or case-revealing imagery.
GitHub's browser supports files up to 25 MiB, so this ZIP is within the upload
limit.

## One GitHub workflow run for the final package

Open **Actions → Build Portable Windows SimOps → Run workflow**.

- **Use workflow from:** `feature/radar-operations-v1`
- **app_only:** `false` (unchecked)
- **case_run_id:** `39713155828`
- **include_meso_addons:** `true` (checked)

Wait for a successful run and download `LIX-SimOps-Portable-Windows`.
The resulting portable folder includes:

- New validated radar cache (SAILS, initial REF/VEL frame, corrected moment
  time selection when combined with the latest app code)
- Existing GLM, MRMS, GOES and environmental Meso products
- The two restored LightningCast Meso products, with 21 frames each
- The case-blind KMSY RAP F00 sounding
- The new velocity palette and mock shift-log form integration
- The offline wheelhouse, launcher scripts and participant front end

This step is applied **after** the validated main weather-cache artifact is
downloaded and **before** the Windows portable package is tested/uploaded.

The restore installer verifies each individual PNG against its own SHA-256
record, requires the correct 2027 simulated valid-time window, updates only
the two LightningCast Meso product records, preserves unrelated Meso imagery
and leaves the entire radar cache untouched. The sounding is recognized at
runtime via its approved fixed relative asset path. The package validation
also requires LightningCast and a real startup radar scan.

The original archived source-case metadata and the recovery installer/ZIP
are not copied into the participant runtime. Only case-blind PNG images and
their manifest entries are included.

## After the package builds

Keep the current known-good installation intact. Extract the new full portable
artifact to a **different** folder, start it via `START_SIMOPS_LAN.bat`, and
test in a disposable session:

- At paused 2:45 PM CST, REF and VEL display actual startup frames.
- Radar product switching stays time aligned, with Matched Moments and All
  Available Cuts available.
- Meso **Satellite / Lightning** shows LightningCast and LightningCast + MRMS
  from the first 2:46:15 PM frame onward. At 2:45, they have not yet arrived.
- Meso **Thermodynamics** shows the case-blind RAP F00 KMSY sounding.
- DSS Mock Shift Log opens the correct Form, and facilitator/test controls
  still work.

Only replace the working installation if all of these checks pass.

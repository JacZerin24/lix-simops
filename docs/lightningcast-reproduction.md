# Historical LightningCast reconstruction — current Endymion case

> Facilitator/developer only. This source-case documentation must not be bundled
> into the participant portable package.

## Current status and correct source window

The active Endymion exercise uses historical **12 May 2021, 06:00–07:45 UTC**
weather, displaced to **6 February 2027, 2:45–4:30 PM CST**. Older December
2022 source-case instructions were obsolete and have been replaced here.

The portable Endymion case currently includes observed GLM flash density,
GOES IR and MRMS lowest-altitude reflectivity, but **does not have LightningCast**.
Genuine model probabilities require the official CSPP Geo software, not a
rebranding of GLM density or invented contours.

Official instructions:
- https://cimss.ssec.wisc.edu/csppgeo/lightningcast_v1.0b2.html
- https://cimss.ssec.wisc.edu/satellite-blog/archives/60965

CSPP Geo LightningCast v1.0beta2 consumes GOES-16 ABI Level 1b channels
02, 05, 13 and 15, and can output geolocated GeoJSON and NetCDF.
It is a separate, registration-gated software download for compatible
Linux systems. It is not bundled with this repository or with SimOps.

The source case occurs at night. That does not automatically prevent model
inference, but skill is different from daytime conditions. Assess the real
probabilities against observed GLM and the radar evolution before using them
in this training case.

## Step 1 — Archived ABI source-data pilot (passed)

The GitHub Actions workflow at:
.github/workflows/endymion-lightningcast-pilot.yml

uses the public NOAA GOES-16 AWS archive. Initial successful run:
https://github.com/JacZerin24/lix-simops/actions/runs/38924109564

This run downloaded **12 ABI L1b NetCDF files**, constituting **three complete
four-channel scene groups**, near 06:31, 06:36 and 06:41 UTC on May 12.
The workflow verified all four required channels were present for each.
The run artifact is named **endymion-lightningcast-abi-pilot**.

If more input history is needed, manually rerun the workflow with an expanded
UTC window. The archive package can become large. Full case coverage is
06:00–07:45 UTC.

## Step 2 — Run the real model on an approved Linux computer

Acquire the *official* CSPP Geo LightningCast v1.0beta2 binary using the
registration/download instructions above. On a compatible, adequately
resourced Linux host, unzip the GitHub pilot artifact, then extract the
included lightningcast-abi-pilot.tar archive into the following directory
of a checkout of this repository:

    data/raw/goes/lightningcast-inputs/

Run the source audit again as needed:

    python scripts/verify_lightningcast_inputs.py --input data/raw/goes/lightningcast-inputs

Then, from the repository root with the authentic model executable in PATH:

    python scripts/run_lightningcast_pilot.py --input data/raw/goes/lightningcast-inputs --output data/raw/lightningcast-native

The pilot runner calls the official CSPP Geo executable, with a small LIX
bounding box (-93 to -87 W, 27.5 to 32.5 N), native GeoJSON, and NetCDF
output. It does not simulate LightningCast values. Record the model version
and metadata. This computation has not yet been executed in this repository.

## Step 3 — Inspect the true CSPP Geo product

Before implementing final rendering, inspect a representative native
GeoJSON and NetCDF to learn its exact coordinate, probability-variable,
and timestamp schema. Do not assume the output uses any particular name.

Evaluate timing and geographic consistency, probability evolution versus
subsequent GLM (source time T to T+60 minutes), relationship to MRMS
convection, and whether nighttime probabilities are physically reasonable.
Retain original satellite scene time and product-availability time, and
ensure case-blind displaced exercise timestamps are never ahead of the
live simulated clock.

## Step 4 — Target: probability over MRMS lowest-altitude reflectivity

The desired Meso product IDs are:
- lightningcast — standalone LightningCast probability
- lightningcast_mrms_lowest_refl — authentic LightningCast probability
  contours over native MRMS lowest-altitude reflectivity (dBZ)

Use geolocated source data on a common projection (not a PNG-on-PNG
screenshot overlay). Draw labeled 10, 25, 50 and 75% contours above the
existing reflectivity palette. Match each LightningCast scene to the latest
MRMS valid time **at or before** the scene time within a short fixed
tolerance; never select future MRMS data to fill a gap. Confirm the two
datasets align over known weather features, and document whether and how
LightningCast parallax is corrected.

When the native output is verified, build both timestamped image products
from it, add the renderer to the Endymion meso packaging jobs, and rebuild
the entire validated portable weather cache. Simply installing an app-only
update cannot add missing weather frames.

The standalone and overlay entries in the meso product configuration will
be silently omitted by the cache builder until their source PNGs exist.

## Training fallback

Do not block the existing Endymion exercise solely on this experimental
optional product. If genuine nighttime LightningCast output fails model or
scientific QA, use the already verified GOES IR, observed GLM and MRMS data.
Never present simulated or retrospective GLM observations as LightningCast.

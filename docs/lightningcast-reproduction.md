# Historical LightningCast plan

LightningCast matters to this exercise because the stated training goal is not only warning operations; it is **early DSS decision-making for a large outdoor event**.

## What is confirmed

NOAA/CIMSS documentation describes LightningCast as a deep-learning model that predicts the probability that GLM will observe lightning in the next 60 minutes.

The model uses four GOES ABI predictors:

- Channel 2 — 0.64 µm visible reflectance
- Channel 5 — 1.6 µm near-IR reflectance
- Channel 13 — 10.3 µm brightness temperature
- Channel 15 — 12.3 µm brightness temperature

The CSPP Geo LightningCast package supports GOES-16 ABI Level 1b input and was explicitly designed to create current **or historical** LightningCast probability fields.

References:

- NOAA/NESDIS HWT 2022 demonstration plan:
  https://goes-r.noaa.gov/users/docs/pg-activities/HWT-PG-2022-Demonstration-Plan.pdf
- CSPP Geo LightningCast:
  https://cimss.ssec.wisc.edu/csppgeo/lightningcast_v1.0b1.html
- CIMSS historical LightningCast example:
  https://cimss.ssec.wisc.edu/satellite-blog/archives/56487

## Why reproduce rather than depend on a 2021 LightningCast archive

LightningCast was not being treated as a required archived product for this exercise. This project has **not confirmed a durable public archive containing an exact May 12, 2021 LightningCast probability stream suitable for replay**.

For a defensible/reproducible exercise, V0.6 therefore downloads the original GOES-16 ABI Level 1b predictors and treats CSPP Geo LightningCast as the preferred historical reconstruction path.

## Input acquisition

V0.6 fetches:

```text
ABI-L1b-RadC
C02
C05
C13
C15
06:00–07:45 UTC
May 12, 2021
GOES-16
```

These files are staged under:

```text
data/raw/goes/lightningcast-inputs/
```

## Intended output

Run CSPP Geo LightningCast over a New Orleans/LIX region of interest and export either:

- imagery with probability contours, or
- NetCDF converted to exercise PNG frames.

Those outputs should be placed under:

```text
data/raw/meso/lightningcast/
```

with UTC timestamps in filenames. Then `build_meso_cache.py` applies the facilitator-only +13 hour 45 minute local-time shift and maps the result onto February 6, 2027.

## Validation

Before the exercise is finalized, compare reconstructed LightningCast evolution against:

- observed GOES GLM lightning
- storm initiation/intensification on KLIX
- the timing of the partner decision points

LightningCast should remain one input to the DSS decision, not an answer key.

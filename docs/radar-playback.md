# Radar playback

LIX SimOps V0.3 uses **preprocessed archived NEXRAD Level II** data. Participants never receive future-frame metadata: the backend filters the radar manifest against the authoritative session simulation clock before returning frames.

## Data flow

```text
Public NEXRAD Level II archive
        |
scripts/fetch_nexrad.py
        |
data/raw/...          (not in git)
        |
scripts/build_radar_cache.py
        |
data/cache/<scenario-id>/radar/
        |-- manifest.json
        +-- frames/...png
        |
time-gated backend API
        |
Radar Operator workspace
```

## Install data tooling

The web application deliberately does not depend on Py-ART/Cartopy.

```bash
pip install -r scripts/requirements-data.txt
```

## Fetch a historical window

```bash
python scripts/fetch_nexrad.py \
  --site KLIX \
  --date 2026-03-11 \
  --start 18:00 \
  --end 22:00 \
  --output data/raw/nexrad/20260311
```

## Build the web cache

```bash
python scripts/build_radar_cache.py \
  --scenario-id mardi-gras-dss-001 \
  --input data/raw/nexrad/20260311 \
  --site KLIX \
  --products REF VEL CC ZDR \
  --elevations 0.5 0.9 1.3 \
  --range-km 230
```

Optionally provide `--event-lat`, `--event-lon`, and `--event-label` to mark the DSS site on every rendered frame.

## Notes

- Raw radar volumes and rendered frames are intentionally excluded from Git.
- Storm-relative velocity is not yet generated automatically; V0.3 begins with the native Level II moments.
- A future version can replace rendered frames with geographic radar tiles without changing the session/time-gating API.

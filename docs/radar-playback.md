# Radar playback

LIX SimOps uses **preprocessed archived NEXRAD Level II** data. Participants never receive future-frame metadata: the backend filters the radar manifest against the authoritative session simulation clock before returning frames.

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

For the recommended December 14, 2022 Endymion candidate:

```bash
python scripts/fetch_nexrad.py \
  --site KLIX \
  --date 2022-12-14 \
  --start 20:45 \
  --end 22:30 \
  --output data/raw/nexrad/20221214
```

Times supplied to the downloader are UTC. Expand the window as needed during case development.

## Build the web cache

```bash
python scripts/build_radar_cache.py \
  --scenario-id mardi-gras-dss-001 \
  --input data/raw/nexrad/20221214 \
  --site KLIX \
  --products REF VEL CC ZDR \
  --elevations 0.5 0.9 1.3 \
  --range-km 230 \
  --simulation-date 2027-02-06 \
  --timezone America/Chicago
```

The `--simulation-date` option preserves the source case's **local clock time** while moving it onto the exercise date. Thus a 3:49 PM CST source scan becomes a 3:49 PM CST scan on February 6, 2027. The participant display does not reveal the historical source date.

Optionally provide `--event-lat`, `--event-lon`, and `--event-label` to mark a DSS reference location on every rendered frame.

## Notes

- Raw radar volumes and rendered frames are intentionally excluded from Git.
- Source filenames remain in the manifest for facilitator traceability.
- Storm-relative velocity is not yet generated automatically; the current implementation begins with native Level II moments.
- A future version can replace rendered frames with geographic radar tiles without changing the session/time-gating API.

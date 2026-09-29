# Radar playback

LIX SimOps uses **preprocessed archived NEXRAD Level II** data. Participants
never receive future-frame metadata: the backend filters the radar manifest
against the authoritative session simulation clock before returning frames.

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

## Fetch the May 12, 2021 source window

```bash
python scripts/fetch_nexrad.py \
  --site KLIX \
  --date 2021-05-12 \
  --start 06:00 \
  --end 07:45 \
  --output data/raw/nexrad/20210512
```

Times supplied to the downloader are UTC.

## Build the web cache

```bash
python scripts/build_radar_cache.py \
  --scenario-id mardi-gras-dss-001 \
  --input data/raw/nexrad/20210512 \
  --site KLIX \
  --products REF VEL CC ZDR \
  --elevations 0.5 0.9 1.3 \
  --range-km 230 \
  --simulation-date 2027-02-06 \
  --timezone America/Chicago \
  --local-time-offset-minutes 825
```

The source case runs from 1:00–2:45 AM CDT. The +825 minute local-time shift
maps that evolution to 2:45–4:30 PM CST on February 6, 2027, including the
2:05 AM historical tornado onset at about 3:50 PM exercise time.

Historical source filenames stay in facilitator-controlled raw storage.
Participant manifests use mapped timestamps and do not expose source keys.

Optionally provide `--event-lat`, `--event-lon`, and `--event-label` to
mark a DSS reference location on every rendered frame.

## Participant controls

The radar workspace is designed for GR2-style rapid interrogation while keeping
the case time-gated:

- **Left / Right Arrow** — previous / next scan
- **Up / Down Arrow** — higher / lower elevation
- **1 / 2 / 3 / 4** — REF / VEL / CC / ZDR
- **Space** — start or pause loop
- **Home** — jump to latest available scan
- **+ / -** — zoom
- **0** — reset pan/zoom
- **F** — fullscreen radar canvas
- Mouse wheel zoom and click-drag pan are also supported.

CC and ZDR use the exercise team's GR/GR2Analyst palette files rather than
generic Matplotlib color scales.

## Notes

- Raw radar volumes and rendered frames are intentionally excluded from Git.
- Storm-relative velocity is not yet generated automatically; the current
  implementation begins with native Level II moments.
- A future version can replace rendered frames with geographic radar tiles
  without changing the session/time-gating API.

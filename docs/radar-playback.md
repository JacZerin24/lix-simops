# Radar playback

LIX SimOps uses **preprocessed archived NEXRAD Level II** data. Participants never receive future-frame metadata: the backend filters the radar manifest against the authoritative session simulation clock before returning frames.

Radar Operations V1 keeps PNG frames as a compatibility/fallback product, but the primary workstation is now **data-aware**. Each scan also has a compact quantized polar gate grid that the browser renders geographically with WebGL2.

## Data flow

```text
Public NEXRAD Level II archive
        |
scripts/fetch_nexrad.py
        |
data/raw/...                         (not in git)
        |
scripts/build_radar_cache.py
        |
data/cache/<scenario-id>/radar/
        |-- manifest.json
        |-- frames/...png            PNG compatibility/fallback
        +-- data/...bin              uint8 gate grids for interactive radar
        |
time-gated backend API
        |
Radar Operator geographic workstation
```

The binary grid is uniform in azimuth and retains the native radar range-gate spacing. Gate values are quantized into 0–254 across the product display range; 255 is reserved for missing data. Product palettes are sampled during the build and stored in the manifest so the browser applies the same palette without baking colors into the data file.

## Install data tooling

The web application deliberately does not depend on Py-ART/Cartopy at runtime.

```bash
pip install -r scripts/requirements-data.txt
```

## Fetch the Endymion source window

The current Endymion build uses the May 12, 2021 KLIX window:

```bash
python scripts/fetch_nexrad.py \
  --site KLIX \
  --date 2021-05-12 \
  --start 05:40 \
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
  --local-time-offset-minutes 825 \
  --include-low-level-revisits \
  --simulation-end 2027-02-06T22:30:00Z
```

The `--simulation-date` option moves the historical case onto the exercise date while preserving its local clock relationship. `--local-time-offset-minutes` then shifts that displaced case to the desired exercise clock. The participant API never exposes the historical source filename or source date.

Optionally provide `--event-lat`, `--event-lon`, and `--event-label` to keep the PNG fallback annotated during case development. Geographic participant overlays are rendered separately in the browser.

## Radar Operations V1 behavior

When a frame contains a gate-data asset and radar-site coordinates, the participant workstation automatically enters data-aware geographic mode.

- Mouse wheel zooms continuously around the cursor.
- Left-drag pans.
- Double-click or `0` returns to the home map view.
- `← / →` steps available frames. With the SAILS-aware cache, 0.5° includes every qualifying intra-volume low-level rescan rather than one frame per volume.
- `↑ / ↓` steps elevation angles.
- `1 / 2 / 3 / 4` selects REF / VEL / CC / ZDR.
- `Space` starts or pauses looping.
- `Home` jumps to the newest available scan.
- `F` toggles fullscreen.
- Product, tilt, scan, and loop changes preserve the same geographic view.
- Loop speed, end-frame dwell, and rocking mode are configurable.
- Cursor interrogation reports gate value, azimuth/range, latitude/longitude, and approximate 4/3-Earth beam height.
- Distance/Bearing, Distance/Speed, and Storm Track tools operate directly on geographic map clicks.
- State boundaries, parish/county boundaries, cities/towns, the KLIX marker, and range rings are bundled for offline use and can be toggled from the Layers menu.

Velocity is stored in the Level-II source units internally and displayed in knots in the workstation.

## Backward compatibility

A cache built before Radar Operations V1 has PNGs but no `radar/data` assets. Those cases continue to work automatically in **PNG compatibility mode**. Rebuild the radar cache to enable geographic rendering and gate interrogation.

## Case blindness and storage

- Raw radar volumes, PNG frames, and gate-grid binaries are intentionally excluded from Git.
- Historical source filenames may remain in the local manifest for facilitator/build traceability, but the backend does not send them to participants.
- The backend still time-gates frames before returning them, so future scans remain unavailable even though the full cache exists on disk.
- WarnGen is intentionally not part of this change. The geographic/data-aware canvas is the foundation for warning polygons and warning-generation workflow next.

## Optional SAILS / startup-scan rebuild (not included in app-only updates)

The original archived-cache build selected only one sweep for each elevation within a Level II volume, ignoring repeated SAILS 0.5-degree low-level scans. New builds using `--include-low-level-revisits` select **each nonempty 0.5-degree sweep**, keeping separate reflectivity/velocity moments and publishing each frame at the end time of its last radar ray. Higher tilts remain one per volume but likewise use actual sweep completion times to avoid lookahead. The file names and API expose **simulation dates only**. This will increase 0.5-degree frame density if supplemental cuts are present in the archived Level II source; it cannot create missing scans.

**An earlier archive window is also needed to fix a paused 2:45 PM Radar login.** The source 06:00Z coincides with simulation start; a volume beginning after 06Z has no earlier frame. Download KLIX from **05:40Z**, and validate that actual 0.5-degree REF and VEL frames were completed at or before the 06:00Z / simulated 2:45 PM start. Don't simply backdate the first 06Z scan, reuse future gates, or change the simulation clock. The new full-case build requires both startup products to be present, and fails if they are not.

These flags are deliberately opt-in on the CLI. The **Full Endymion Case Build** workflow now uses them, but that workflow must be intentionally dispatched on the correct branch and must actually finish its build/validation. It does not run as part of the **app-only** update. The previous validated cache continues to use its existing radar frame rate and may remain blank at T=0.

### Procedure for a future verified replacement weather cache

1. Keep a known-good backup of the existing `data/cache/mardi-gras-dss-001`. Never replace it with a partial cache.
2. Dispatch **Full Endymion Case Build** on the `feature/radar-operations-v1` branch. Do not reuse the older validated case run ID when trying to obtain SAILS/pre-roll.
3. Verify the archive inventory includes pre-06:00Z volumes, the radar manifests contain 0.5-degree frames at/before T=0 and more frequent sweeps when the source supports it, and the final `--require-startup-radar` validation passes. Spot-check 0.5° REF and VEL animation around the severe period and confirm no frames arrive ahead of the simulated clock.
4. Only then build a **full** Windows portable package (`app_only=false`) pointing `case_run_id` to the **new** successful full-case build run. An app-only update cannot replace or improve the radar data.
5. Test the new full package separately on the office LAN before replacing the known-good installation. Verify demo startup, product colors, timed storm reports, team isolation, and AAR exports.

### Immediate demo-only workaround with an older cache

Create a **disposable demo session**, start it at 4x speed while not projected, and pause as soon as its first radar image becomes available. Use that paused demo for interface training, then create a **fresh untouched 2:45 PM session** for the exercise. This avoids a blank demo screen, but it is not a substitute for a true pre-start radar scan. Do not project future case details or use the demo session as the official exercise; if the first scan arrives after a scripted inject, use a static interface overview instead.

# Mesoanalyst workspace

V0.4 adds a time-gated environmental/product workspace for the Mesoanalyst role.

The simulator intentionally uses a **generic product manifest** rather than hard-coding one archive source. This allows a scenario to combine internal exports, NOAA archives, LightningCast imagery, MRMS products, satellite images, surface analyses, and model guidance in one synchronized interface.

## Categories

The initial Mardi Gras scenario template includes:

- Environment
- Satellite
- Lightning
- MRMS
- Observations
- Guidance

## Staging files

Prepare images under the source directories defined in:

```text
scenarios/mardi-gras/meso-products.yaml
```

Every frame filename needs a UTC timestamp containing either:

```text
YYYYMMDDHHMMSS
YYYYMMDD_HHMMSS
YYYYMMDDTHHMMSSZ
```

Example:

```text
data/raw/meso/lightningcast/lightningcast_20260311T184500Z.png
```

## Build the cache

```bash
python scripts/build_meso_cache.py \
  --scenario-id mardi-gras-dss-001 \
  --config scenarios/mardi-gras/meso-products.yaml
```

This writes:

```text
data/cache/mardi-gras-dss-001/meso/manifest.json
data/cache/mardi-gras-dss-001/meso/frames/...
```

## DRT protection

The browser does not receive the full historical manifest. On each request, the backend compares product timestamps to the authoritative session simulation time and returns only frames that are already valid. This prevents a participant from looking ahead in the case through browser developer tools.

## Why image-based first

Many environmental resources have different archive formats and access rules. A normalized image cache lets the exercise use exactly the operational products desired without coupling the participant interface to a specific external service. Automated GOES/MRMS/observation acquisition can be added behind the same manifest later.

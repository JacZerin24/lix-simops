# Data sources

Planned data families:

- NEXRAD Level II / derived radar products
- GOES ABI
- GOES GLM
- LightningCast
- MRMS
- Surface observations
- Environmental analysis / guidance

## NEXRAD Level II

The radar acquisition script uses the public Unidata/NOAA NEXRAD Level II archive in:

```text
s3://unidata-nexrad-level2/
```

The archive is accessed anonymously and raw volumes are written only to local `data/` storage. The older `noaa-nexrad-level2` bucket is deprecated, so new tooling should use `unidata-nexrad-level2`.

Reference: https://registry.opendata.aws/noaa-nexrad/

## Repository policy

This repository stores code, configuration, manifests, and lightweight metadata only. Bulk meteorological archives must not be committed.

Historical data should be downloaded and preprocessed into `data/cache/<scenario-id>/` before the exercise. Participant APIs must expose only products whose timestamps are at or before the authoritative simulation clock.

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RadarProduct(BaseModel):
    id: str
    label: str
    field: str
    units: str = ""
    vmin: float | None = None
    vmax: float | None = None
    cmap: str | None = None
    palette: list[str] = Field(default_factory=list)


class RadarGridData(BaseModel):
    asset: str
    azimuth_bins: int = Field(gt=0)
    range_bins: int = Field(gt=0)
    range_start_m: float
    range_step_m: float = Field(gt=0)
    value_min: float
    value_max: float
    nodata: int = 255
    actual_elevation: float | None = None


class RadarFrame(BaseModel):
    timestamp: datetime
    product: str
    elevation: float
    asset: str
    source_key: str | None = None
    data: RadarGridData | None = None


class RadarManifest(BaseModel):
    radar_site: str
    generated_at: datetime
    products: list[RadarProduct]
    frames: list[RadarFrame]
    range_km: float = Field(default=230.0, gt=0)
    radar_latitude: float | None = None
    radar_longitude: float | None = None
    radar_altitude_m: float | None = None


def visible_frames(
    manifest: RadarManifest,
    sim_time: datetime,
    product: str,
    elevation: float,
) -> list[RadarFrame]:
    frames = [
        frame
        for frame in manifest.frames
        if frame.product == product
        and abs(frame.elevation - elevation) < 0.051
        and frame.timestamp <= sim_time
    ]
    return sorted(frames, key=lambda frame: frame.timestamp)

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class MesoProduct(BaseModel):
    id: str
    label: str
    category: str
    units: str = ""
    description: str = ""
    kind: str = "image"


class MesoFrame(BaseModel):
    timestamp: datetime
    product: str
    asset: str
    source_key: str | None = None


class MesoManifest(BaseModel):
    generated_at: datetime
    products: list[MesoProduct]
    frames: list[MesoFrame]


def visible_frames(
    manifest: MesoManifest,
    sim_time: datetime,
    product: str,
) -> list[MesoFrame]:
    frames = [
        frame
        for frame in manifest.frames
        if frame.product == product and frame.timestamp <= sim_time
    ]
    return sorted(frames, key=lambda frame: frame.timestamp)

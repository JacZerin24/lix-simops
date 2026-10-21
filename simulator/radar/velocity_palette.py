"""Runtime GR velocity palette rendering for prebuilt SimOps radar gate grids.

No Matplotlib, Py-ART, or radar cache rebuild is needed for WebGL.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class ColorStop:
    value: float
    start: tuple[int, int, int]
    end: tuple[int, int, int]


def _channels(parts: list[str]) -> tuple[int, int, int]:
    if len(parts) != 3:
        raise ValueError("GR palette RGB must contain three channels")
    rgb = tuple(int(part) for part in parts)
    if not all(0 <= channel <= 255 for channel in rgb):
        raise ValueError("GR palette channels must be between 0 and 255")
    return rgb


@lru_cache(maxsize=8)
def _read_gr_palette(path: str) -> tuple[float, tuple[ColorStop, ...]]:
    scale = 1.0
    colors: list[ColorStop] = []
    with Path(path).open("r", encoding="utf-8-sig") as handle:
        for source in handle:
            line = source.split(";", 1)[0].strip()
            if not line or ":" not in line:
                continue
            key, _, raw = line.partition(":")
            key = key.strip().lower()
            fields = raw.split()
            if key == "scale":
                scale = float(fields[0])
            elif key in {"color", "solidcolor"}:
                if len(fields) not in {4, 7}:
                    raise ValueError(f"Invalid {key} definition: {line}")
                start = _channels(fields[1:4])
                end = start if key == "solidcolor" or len(fields) == 4 else _channels(fields[4:7])
                colors.append(ColorStop(float(fields[0]), start, end))
    if scale <= 0 or len(colors) < 2:
        raise ValueError("GR palette requires positive Scale and at least two color entries")
    colors.sort(key=lambda stop: stop.value)
    if any(a.value >= b.value for a, b in zip(colors, colors[1:])):
        raise ValueError("GR palette stop values must be unique")
    return scale, tuple(colors)


def make_velocity_palette(path: str | Path, *, vmin: float, vmax: float) -> list[str]:
    """Build a 256-entry velocity palette, converting m/s gates to GR palette KTS.

    The optional second RGB on a Color line ends that line's interval;
    SolidColor holds its RGB through the next breakpoint. Distinct breakpoint
    RGBs preserve the sharp transitions in the uploaded GR color table.
    """
    if vmax <= vmin:
        raise ValueError("Velocity display range must be increasing")
    scale, stops = _read_gr_palette(str(path))
    positions = [stop.value for stop in stops]
    result: list[str] = []
    for index in range(256):
        # Valid gate values occupy indices 0-254; 255 is reserved for nodata.
        physical_value = vmin + min(index, 254) / 254 * (vmax - vmin)
        value = physical_value * scale
        ix = bisect_right(positions, value) - 1
        if ix < 0:
            color = stops[0].start
        elif ix >= len(stops) - 1:
            color = stops[-1].start
        else:
            lower, upper = stops[ix], stops[ix + 1]
            frac = (value - lower.value) / (upper.value - lower.value)
            color = tuple(
                round(lo + (hi - lo) * frac)
                for lo, hi in zip(lower.start, lower.end)
            )
        result.append("#" + "".join(f"{c:02x}" for c in color))
    return result

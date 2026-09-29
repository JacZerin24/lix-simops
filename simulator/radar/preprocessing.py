from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from simulator.time_mapping import remap_timestamp_to_simulation_date

from .manifest import RadarFrame, RadarGridData, RadarManifest, RadarProduct
from .products import RADAR_PRODUCTS, RADAR_RENDER_CONFIG


NEXRAD_TIME_RE = re.compile(r"([A-Z0-9]{4})(\d{8})_(\d{6})")
PALETTE_ROOT = Path(__file__).resolve().parent / "palettes"
PALETTE_COLOR_RE = re.compile(
    r"^Color4?:\s*([-+]?\d+(?:\.\d+)?)\s+"
    r"(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?"
)


def timestamp_from_filename(path: Path) -> datetime:
    match = NEXRAD_TIME_RE.search(path.name)
    if not match:
        raise ValueError(f"Unable to parse NEXRAD timestamp from {path.name}")
    value = datetime.strptime(
        f"{match.group(2)}{match.group(3)}",
        "%Y%m%d%H%M%S",
    )
    return value.replace(tzinfo=timezone.utc)


def _field_for_product(radar, product_id: str) -> str | None:
    config = RADAR_RENDER_CONFIG.get(product_id)
    if not config:
        return None
    for candidate in config["field_candidates"]:
        if candidate in radar.fields:
            return candidate
    return None


def _sweep_valid_gate_count(radar, sweep: int, field: str) -> int:
    data = radar.fields[field]["data"]
    start = int(radar.sweep_start_ray_index["data"][sweep])
    end = int(radar.sweep_end_ray_index["data"][sweep]) + 1
    subset = data[start:end]
    count = getattr(subset, "count", None)
    if callable(count):
        return int(count())
    return int(getattr(subset, "size", len(subset)))


def _nearest_sweep(
    radar,
    elevation: float,
    field: str | None = None,
) -> tuple[int, float]:
    fixed_angles = [float(value) for value in radar.fixed_angle["data"]]
    nearby = [
        idx
        for idx, angle in enumerate(fixed_angles)
        if abs(angle - elevation) <= 0.4
    ]
    if not nearby:
        nearby = list(range(len(fixed_angles)))

    if field is not None:
        index = max(
            nearby,
            key=lambda idx: (
                _sweep_valid_gate_count(radar, idx, field),
                -abs(fixed_angles[idx] - elevation),
            ),
        )
    else:
        index = min(nearby, key=lambda idx: abs(fixed_angles[idx] - elevation))
    return index, fixed_angles[index]


def _resolve_colormap(name: str) -> str:
    import matplotlib as mpl

    if name in mpl.colormaps:
        return name

    if name.startswith("pyart_"):
        modern_name = name.removeprefix("pyart_")
        if modern_name in mpl.colormaps:
            return modern_name

    raise ValueError(
        f"Radar colormap {name!r} is not registered by Matplotlib/Py-ART"
    )


def _load_palette_colormap(
    palette_path: Path,
    *,
    name: str,
    vmin: float,
    vmax: float,
):
    from matplotlib.colors import LinearSegmentedColormap

    stops: list[tuple[float, tuple[float, float, float, float]]] = []
    with palette_path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            match = PALETTE_COLOR_RE.match(raw_line.strip())
            if not match:
                continue
            value = float(match.group(1))
            red = int(match.group(2)) / 255.0
            green = int(match.group(3)) / 255.0
            blue = int(match.group(4)) / 255.0
            alpha = int(match.group(5)) / 255.0 if match.group(5) else 1.0
            stops.append((value, (red, green, blue, alpha)))

    if len(stops) < 2:
        raise ValueError(f"Radar palette {palette_path} has fewer than two color stops")

    if stops[0][0] > stops[-1][0]:
        stops.reverse()

    span = vmax - vmin
    if span <= 0:
        raise ValueError(f"Invalid radar color range {vmin}..{vmax}")

    normalized = [
        (
            min(1.0, max(0.0, (value - vmin) / span)),
            color,
        )
        for value, color in stops
        if vmin <= value <= vmax
    ]
    if not normalized:
        raise ValueError(
            f"Radar palette {palette_path} has no stops inside {vmin}..{vmax}"
        )

    return LinearSegmentedColormap.from_list(name, normalized, N=256)


def _colormap_for_product(product_id: str, config: dict):
    palette_file = config.get("palette_file")
    if palette_file:
        return _load_palette_colormap(
            PALETTE_ROOT / palette_file,
            name=str(config["cmap"]),
            vmin=float(config["vmin"]),
            vmax=float(config["vmax"]),
        )
    return _resolve_colormap(str(config["cmap"]))


def _palette(cmap, size: int = 256) -> list[str]:
    import matplotlib.pyplot as plt

    if isinstance(cmap, str):
        cmap = plt.get_cmap(_resolve_colormap(cmap))

    values: list[str] = []
    for index in range(size):
        red, green, blue, _ = cmap(index / max(1, size - 1))
        values.append(
            f"#{round(red * 255):02x}{round(green * 255):02x}{round(blue * 255):02x}"
        )
    return values


def _uniform_gate_grid(
    radar,
    *,
    field: str,
    sweep: int,
    range_km: float,
    value_min: float,
    value_max: float,
    azimuth_bins: int = 360,
) -> tuple[bytes, dict]:
    """Resample one sweep to a compact, browser-friendly polar grid.

    Values are stored as unsigned bytes 0..254 across the configured display
    range; 255 is reserved for missing data. The azimuth dimension is uniform,
    which keeps the browser renderer and cursor interrogation deterministic.
    """
    import numpy as np

    sweep_slice = radar.get_slice(sweep)
    azimuths = np.mod(
        np.asarray(radar.azimuth["data"][sweep_slice], dtype=np.float64),
        360.0,
    )
    ranges = np.asarray(radar.range["data"], dtype=np.float64)
    gate_count = int(np.searchsorted(ranges, range_km * 1000.0, side="right"))
    gate_count = max(1, min(gate_count, len(ranges)))

    values = np.ma.asarray(radar.fields[field]["data"][sweep_slice, :gate_count])
    target_azimuths = np.arange(azimuth_bins, dtype=np.float64) * (360.0 / azimuth_bins)

    angular_difference = np.abs(
        ((azimuths[:, None] - target_azimuths[None, :] + 180.0) % 360.0) - 180.0
    )
    ray_indices = angular_difference.argmin(axis=0)
    uniform = np.ma.asarray(values[ray_indices, :])

    filled = np.ma.filled(uniform, np.nan).astype(np.float64)
    invalid = np.ma.getmaskarray(uniform) | ~np.isfinite(filled)

    quantized = np.full(filled.shape, 255, dtype=np.uint8)
    if value_max <= value_min:
        raise ValueError("Radar value_max must be greater than value_min")

    normalized = np.clip((filled - value_min) / (value_max - value_min), 0.0, 1.0)
    valid = ~invalid
    quantized[valid] = np.rint(normalized[valid] * 254.0).astype(np.uint8)

    range_step_m = (
        float(np.median(np.diff(ranges[:gate_count])))
        if gate_count > 1
        else 1.0
    )
    metadata = {
        "azimuth_bins": azimuth_bins,
        "range_bins": gate_count,
        "range_start_m": float(ranges[0]),
        "range_step_m": range_step_m,
        "value_min": float(value_min),
        "value_max": float(value_max),
        "nodata": 255,
    }
    return quantized.tobytes(order="C"), metadata


def build_radar_cache(
    *,
    input_dir: Path,
    output_root: Path,
    radar_site: str,
    products: list[str],
    elevations: list[float],
    range_km: float = 230.0,
    event_lat: float | None = None,
    event_lon: float | None = None,
    event_label: str = "Event",
    simulation_date: date | None = None,
    timezone_name: str = "America/Chicago",
    local_time_offset_minutes: int = 0,
) -> RadarManifest:
    """Build archived NEXRAD Level II into both PNG fallback and gate-aware assets.

    PNGs remain available for backwards compatibility. New builds also include a
    compact polar gate grid for each frame so the browser can render radar
    geographically, interrogate values, and preserve one view across products.

    When simulation_date is supplied, source data keep their local clock time but
    are mapped onto the exercise date. local_time_offset_minutes can then shift
    the case to the desired displaced-real-time exercise clock.
    """
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import pyart

    output_root = output_root.resolve()
    radar_root = output_root / "radar"
    frame_root = radar_root / "frames"
    data_root = radar_root / "data"
    frame_root.mkdir(parents=True, exist_ok=True)
    data_root.mkdir(parents=True, exist_ok=True)

    frames: list[RadarFrame] = []
    product_ids_with_frames: set[str] = set()
    radar_latitude: float | None = None
    radar_longitude: float | None = None
    radar_altitude_m: float | None = None

    radar_files = sorted(
        path
        for path in input_dir.iterdir()
        if path.is_file() and "MDM" not in path.name
    )

    parsed_files: list[tuple[Path, datetime]] = []
    for source in radar_files:
        try:
            parsed_files.append((source, timestamp_from_filename(source)))
        except ValueError as exc:
            print(f"Skipping {source.name}: {exc}")

    if not parsed_files:
        raise ValueError(f"No parseable NEXRAD volumes found in {input_dir}")

    zone = ZoneInfo(timezone_name)
    source_base_date = min(
        timestamp.astimezone(zone).date()
        for _, timestamp in parsed_files
    )

    for source, source_timestamp in parsed_files:
        timestamp = (
            remap_timestamp_to_simulation_date(
                source_timestamp,
                source_base_date=source_base_date,
                simulation_base_date=simulation_date,
                timezone_name=timezone_name,
            )
            if simulation_date
            else source_timestamp
        )
        if local_time_offset_minutes:
            timestamp += timedelta(minutes=local_time_offset_minutes)

        try:
            radar = pyart.io.read_nexrad_archive(str(source))
        except Exception as exc:
            print(f"Skipping {source.name}: {exc}")
            continue

        if radar_latitude is None:
            radar_latitude = float(radar.latitude["data"][0])
            radar_longitude = float(radar.longitude["data"][0])
            radar_altitude_m = float(radar.altitude["data"][0])

        display = pyart.graph.RadarMapDisplay(radar)

        for product_id in products:
            field = _field_for_product(radar, product_id)
            if field is None:
                continue

            config = RADAR_RENDER_CONFIG[product_id]
            cmap = _colormap_for_product(product_id, config)
            for requested_elevation in elevations:
                sweep, actual_elevation = _nearest_sweep(
                    radar,
                    requested_elevation,
                    field=field,
                )
                if abs(actual_elevation - requested_elevation) > 0.4:
                    continue
                if _sweep_valid_gate_count(radar, sweep, field) == 0:
                    continue

                stem = timestamp.strftime("%Y%m%dT%H%M%SZ")
                destination = (
                    frame_root
                    / product_id
                    / f"{requested_elevation:.1f}"
                    / f"{stem}.png"
                )
                destination.parent.mkdir(parents=True, exist_ok=True)

                data_destination = (
                    data_root
                    / product_id
                    / f"{requested_elevation:.1f}"
                    / f"{stem}.bin"
                )
                data_destination.parent.mkdir(parents=True, exist_ok=True)

                packed, grid = _uniform_gate_grid(
                    radar,
                    field=field,
                    sweep=sweep,
                    range_km=range_km,
                    value_min=float(config["vmin"]),
                    value_max=float(config["vmax"]),
                )
                data_destination.write_bytes(packed)

                fig = plt.figure(figsize=(10, 8), constrained_layout=True)
                try:
                    display.plot_ppi_map(
                        field,
                        sweep=sweep,
                        width=range_km * 2000.0,
                        height=range_km * 2000.0,
                        vmin=config["vmin"],
                        vmax=config["vmax"],
                        cmap=cmap,
                        title=(
                            f"{radar_site} {RADAR_PRODUCTS[product_id]} "
                            f"{actual_elevation:.1f}° — "
                            f"{timestamp.astimezone(zone):%H:%M:%S %Z}"
                        ),
                        colorbar_flag=True,
                        embellish=True,
                        add_grid_lines=True,
                        resolution="50m",
                    )
                    if event_lat is not None and event_lon is not None:
                        ax = plt.gca()
                        ax.plot(
                            event_lon,
                            event_lat,
                            marker="*",
                            markersize=15,
                            markeredgecolor="black",
                            transform=ccrs.PlateCarree(),
                            label=event_label,
                        )
                        ax.legend(loc="upper right")

                    fig.savefig(destination, dpi=125, bbox_inches="tight")
                finally:
                    plt.close(fig)

                product_ids_with_frames.add(product_id)
                frames.append(
                    RadarFrame(
                        timestamp=timestamp,
                        product=product_id,
                        elevation=round(requested_elevation, 1),
                        asset=destination.relative_to(output_root).as_posix(),
                        source_key=source.name,
                        data=RadarGridData(
                            asset=data_destination.relative_to(output_root).as_posix(),
                            actual_elevation=float(actual_elevation),
                            **grid,
                        ),
                    )
                )

    manifest_products = []
    for product_id in products:
        if product_id not in product_ids_with_frames:
            continue
        config = RADAR_RENDER_CONFIG[product_id]
        manifest_products.append(
            RadarProduct(
                id=product_id,
                label=RADAR_PRODUCTS[product_id],
                field=config["field_candidates"][0],
                units=config["units"],
                vmin=config["vmin"],
                vmax=config["vmax"],
                cmap=config["cmap"],
                palette=_palette(_colormap_for_product(product_id, config)),
            )
        )

    manifest = RadarManifest(
        radar_site=radar_site,
        generated_at=datetime.now(timezone.utc),
        products=manifest_products,
        frames=sorted(frames, key=lambda frame: (frame.timestamp, frame.product, frame.elevation)),
        range_km=range_km,
        radar_latitude=radar_latitude,
        radar_longitude=radar_longitude,
        radar_altitude_m=radar_altitude_m,
    )

    radar_root.mkdir(parents=True, exist_ok=True)
    with (radar_root / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest.model_dump(mode="json"), handle, indent=2)

    return manifest

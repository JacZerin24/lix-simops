from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from simulator.time_mapping import remap_timestamp_to_simulation_date

from .manifest import RadarFrame, RadarManifest, RadarProduct
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


def _nearest_sweep(radar, elevation: float, field: str | None = None) -> tuple[int, float]:
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

    raise ValueError(f"Radar colormap {name!r} is not registered by Matplotlib/Py-ART")


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

    # GR/GR2Analyst palette files are commonly written high-to-low. Reverse
    # them before normalization so duplicate thresholds retain the intended
    # below/above ordering (important for the ZDR discontinuity at 0 dB).
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
        raise ValueError(f"Radar palette {palette_path} has no stops inside {vmin}..{vmax}")

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
    """Render archived NEXRAD Level II volumes into time-gated web assets.

    When simulation_date is supplied, source data keep their local clock time but
    are mapped onto the exercise date. This lets a real historical LIX case be
    presented as a Mardi Gras DRT without exposing the source date.

    Py-ART/Cartopy/Matplotlib are imported lazily so the web backend does not
    need the heavy radar-processing dependency stack.
    """
    import cartopy.crs as ccrs
    import matplotlib.pyplot as plt
    import pyart

    output_root = output_root.resolve()
    radar_root = output_root / "radar"
    frame_root = radar_root / "frames"
    frame_root.mkdir(parents=True, exist_ok=True)

    frames: list[RadarFrame] = []
    product_ids_with_frames: set[str] = set()

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
                local_time_offset_minutes=local_time_offset_minutes,
            )
            if simulation_date
            else source_timestamp
        )

        try:
            radar = pyart.io.read_nexrad_archive(str(source))
        except Exception as exc:
            print(f"Skipping {source.name}: {exc}")
            continue

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

                destination = (
                    frame_root
                    / product_id
                    / f"{requested_elevation:.1f}"
                    / f"{timestamp.strftime('%Y%m%dT%H%M%SZ')}.png"
                )
                destination.parent.mkdir(parents=True, exist_ok=True)

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
            )
        )

    manifest = RadarManifest(
        radar_site=radar_site,
        generated_at=datetime.now(timezone.utc),
        products=manifest_products,
        frames=sorted(frames, key=lambda frame: (frame.timestamp, frame.product, frame.elevation)),
        range_km=range_km,
    )

    radar_root.mkdir(parents=True, exist_ok=True)
    with (radar_root / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest.model_dump(mode="json", exclude_none=True), handle, indent=2)

    return manifest

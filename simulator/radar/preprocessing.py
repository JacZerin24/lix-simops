from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .manifest import RadarFrame, RadarManifest, RadarProduct
from .products import RADAR_PRODUCTS, RADAR_RENDER_CONFIG


NEXRAD_TIME_RE = re.compile(r"([A-Z0-9]{4})(\d{8})_(\d{6})")


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


def _nearest_sweep(radar, elevation: float) -> tuple[int, float]:
    fixed_angles = [float(value) for value in radar.fixed_angle["data"]]
    index = min(range(len(fixed_angles)), key=lambda idx: abs(fixed_angles[idx] - elevation))
    return index, fixed_angles[index]


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
) -> RadarManifest:
    """Render archived NEXRAD Level II volumes into time-gated web assets.

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

    for source in radar_files:
        try:
            timestamp = timestamp_from_filename(source)
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
            for requested_elevation in elevations:
                sweep, actual_elevation = _nearest_sweep(radar, requested_elevation)
                if abs(actual_elevation - requested_elevation) > 0.4:
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
                        cmap=config["cmap"],
                        title=(
                            f"{radar_site} {RADAR_PRODUCTS[product_id]} "
                            f"{actual_elevation:.1f}° — {timestamp:%Y-%m-%d %H:%M:%SZ}"
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
        json.dump(manifest.model_dump(mode="json"), handle, indent=2)

    return manifest

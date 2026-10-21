"""Runtime velocity table regression tests.

The case gate cache stays unchanged; palette colors are generated on request.
"""

from pathlib import Path
from types import SimpleNamespace

from backend.app.services.radar_data import _product_palette
from simulator.radar.velocity_palette import _read_gr_palette, make_velocity_palette


PALETTE = Path(__file__).resolve().parents[2] / "simulator" / "radar" / "palettes" / "dl_BV-GRA2.pal"


def test_uploaded_gr_palette_parses_and_converts_knots() -> None:
    scale, stops = _read_gr_palette(str(PALETTE))
    assert scale == 1.9426
    assert len(stops) == 14
    assert stops[0].value == -120
    assert stops[-1].value == 120
    assert stops[0].start == (255, 0, 128)


def test_solids_hold_and_two_color_intervals_are_preserved() -> None:
    # Test the exact behavior of an uploaded SolidColor and a two-RGB Color.
    # Isolate a range where 1 m/s == 1.9426 knots, covering +10..+40 KTS.
    colors = make_velocity_palette(PALETTE, vmin=-40, vmax=40)
    assert len(colors) == 256
    assert colors[254] == colors[255]
    assert all(len(x) == 7 and x.startswith("#") for x in colors)
    # Approaching toward the radar is green; receding velocities turn red.
    assert colors[64][1:3] == "01"
    assert colors[200][1:3] == "ff"


def test_only_velocity_product_is_overridden() -> None:
    original = ["#123456", "#abcdef"]
    reflectivity = SimpleNamespace(id="REF", vmin=-10, vmax=80, palette=original)
    cc = SimpleNamespace(id="CC", vmin=0.2, vmax=1.04, palette=original)
    velocity = SimpleNamespace(id="VEL", vmin=-40, vmax=40, palette=original)
    assert _product_palette(reflectivity) == original
    assert _product_palette(cc) == original
    override = _product_palette(velocity)
    assert len(override) == 256
    assert override != original

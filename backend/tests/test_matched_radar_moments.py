"""Review genuine paired radar sweeps without fabricating a uniform timeline."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from backend.app.services.radar_data import matched_reflectivity_frames


BASE = datetime(2027, 2, 6, 20, 45, tzinfo=timezone.utc)


def record(product, sweep, minutes, volume=0, elevation=0.5):
    return SimpleNamespace(
        product=product,
        elevation=elevation,
        timestamp=BASE + timedelta(minutes=minutes),
        asset=(
            f"radar/frames/{product}/{elevation:.1f}/"
            f"20270206T204500Z_v{volume:03d}_s{sweep:02d}.png"
        ),
    )


def test_reflectivity_uses_one_nearby_real_cut_per_velocity_cut():
    # Split-cut behavior: an extra REF sweep in the same volume does not
    # justify adding a fake VEL/CC/ZDR frame.
    ref_a = record("REF", 0, 0.0)
    vel_a = record("VEL", 1, 0.4)
    ref_extra = record("REF", 2, 1.8)
    vel_b = record("VEL", 3, 2.2)
    ref_b = record("REF", 4, 2.0)
    manifest = SimpleNamespace(frames=[
        ref_a, vel_a, ref_extra, vel_b, ref_b,
        record("REF", 0, 5.0, volume=1),
        record("VEL", 1, 5.4, volume=1),
        record("REF", 0, 0.5, elevation=0.9),
    ])
    paired = matched_reflectivity_frames(manifest, 0.5)
    assert len(paired) == 3
    assert paired[0].asset == ref_a.asset
    assert paired[1].asset == ref_b.asset
    assert paired[2].timestamp == BASE + timedelta(minutes=5.0)
    assert ref_extra not in paired
    # The original archive still includes every sweep.
    assert ref_extra in manifest.frames


def test_no_cross_volume_or_cross_elevation_pairing():
    # Do not silently turn a 1.3 degree sweep into a 0.5-degree SAILS frame.
    manifest = SimpleNamespace(frames=[
        record("REF", 0, 2.0, volume=2),
        record("VEL", 1, 2.1, volume=1),
        record("REF", 0, 2.0, volume=1, elevation=1.3),
    ])
    assert matched_reflectivity_frames(manifest, 0.5) == []


def test_old_caches_without_volume_metadata_remain_usable():
    legacy = SimpleNamespace(
        product="REF", elevation=0.5, timestamp=BASE,
        asset="radar/frames/REF/0.5/20270206T204500Z.png",
    )
    manifest = SimpleNamespace(frames=[legacy])
    assert matched_reflectivity_frames(manifest, 0.5) == [legacy]

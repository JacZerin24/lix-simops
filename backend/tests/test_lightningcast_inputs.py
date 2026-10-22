"""Tests for the historical ABI availability audit."""
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from verify_lightningcast_inputs import summarize_files


def abi_file(channel: str, time: str) -> Path:
    return Path(
        f"OR_ABI-L1b-RadC-M6C{channel}_G16_s2021132{time}0_e20211320645000_c20211320646000.nc"
    )


def test_complete_abi_scan_bins() -> None:
    inputs = [
        abi_file(channel, minute)
        for minute in ("063102", "063602")
        for channel in ("02", "05", "13", "15")
    ]
    start = datetime(2021, 5, 12, 6, 30, tzinfo=timezone.utc)
    end = datetime(2021, 5, 12, 6, 45, tzinfo=timezone.utc)
    result = summarize_files(inputs, start, end)
    assert len(result["complete_scans"]) == 2
    assert len(result["incomplete_scans"]) == 0


def test_missing_abi_channel_is_reported() -> None:
    inputs = [abi_file(channel, "063102") for channel in ("02", "05", "13")]
    result = summarize_files(
        inputs,
        datetime(2021, 5, 12, 6, 30, tzinfo=timezone.utc),
        datetime(2021, 5, 12, 6, 45, tzinfo=timezone.utc),
    )
    assert not result["complete_scans"]
    assert result["incomplete_scans"][0]["missing_channels"] == ["15"]


def test_out_of_window_and_unrecognized_not_misclassified() -> None:
    inputs = [
        abi_file("02", "063102"),
        abi_file("05", "063102"),
        abi_file("13", "063102"),
        abi_file("15", "063102"),
        abi_file("02", "070102"),
        Path("nonsense.nc"),
    ]
    result = summarize_files(
        inputs,
        datetime(2021, 5, 12, 6, 30, tzinfo=timezone.utc),
        datetime(2021, 5, 12, 6, 45, tzinfo=timezone.utc),
    )
    assert len(result["complete_scans"]) == 1
    assert not result["incomplete_scans"]
    assert result["unrecognized_files"] == ["nonsense.nc"]

"""Audit genuine GOES-16 ABI Level 1b inputs before CSPP Geo LightningCast.

This script does not generate LightningCast predictions. It verifies that each
five-minute scan interval has all four expected ABI channels.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re

# Keep this audit dependency-free so it can run in backend CI without boto3.
START_RE = re.compile(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)")


def object_start_time(filename: str) -> datetime | None:
    match = START_RE.search(filename)
    if match is None:
        return None
    year, day, hour, minute, second, tenth = map(int, match.groups())
    return datetime.strptime(f"{year}{day:03d}", "%Y%j").replace(
        hour=hour, minute=minute, second=second,
        microsecond=tenth * 100_000, tzinfo=timezone.utc,
    )

CHANNEL_RE = re.compile(r"-M\dC(\d{2})_")
CHANNELS = ("02", "05", "13", "15")


def summarize_files(paths: list[Path], start: datetime, end: datetime) -> dict:
    """Group ABI files into five-minute bins without assuming identical channel seconds."""
    groups: dict[datetime, dict[str, str]] = defaultdict(dict)
    unexpected = []
    for path in paths:
        match = CHANNEL_RE.search(path.name)
        time = object_start_time(path.name)
        if not match or time is None:
            unexpected.append(path.name)
            continue
        channel = match.group(1)
        if channel not in CHANNELS or not (start <= time <= end):
            continue
        # ABI channels from one scan can have slightly different start seconds.
        bin_start = time.replace(minute=(time.minute // 5) * 5, second=0, microsecond=0)
        groups[bin_start][channel] = path.name
    complete = []
    incomplete = []
    for timestamp, channels in sorted(groups.items()):
        record = {
            "scan_start_utc": timestamp.isoformat(),
            "channels": channels,
            "missing_channels": sorted(set(CHANNELS) - set(channels)),
        }
        (incomplete if record["missing_channels"] else complete).append(record)
    return {
        "input_window_start_utc": start.isoformat(),
        "input_window_end_utc": end.isoformat(),
        "required_channels": list(CHANNELS),
        "complete_scans": complete,
        "incomplete_scans": incomplete,
        "unrecognized_files": unexpected,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--date", default="2021-05-12")
    parser.add_argument("--start", default="06:30")
    parser.add_argument("--end", default="06:45")
    parser.add_argument("--min-complete", default=2, type=int)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    start = datetime.fromisoformat(f"{args.date}T{args.start}:00+00:00")
    end = datetime.fromisoformat(f"{args.date}T{args.end}:00+00:00")
    if end <= start:
        parser.error("--end must be later than --start")
    if not args.input.is_dir():
        parser.error(f"Input directory does not exist: {args.input}")
    result = summarize_files(
        [p for p in args.input.iterdir() if p.is_file()], start, end
    )
    result["complete_scan_count"] = len(result["complete_scans"])
    result["incomplete_scan_count"] = len(result["incomplete_scans"])

    print(
        f"LightningCast ABI inputs: {result['complete_scan_count']} complete "
        f"five-minute bins; {result['incomplete_scan_count']} incomplete bins."
    )
    for record in result["incomplete_scans"]:
        print(f"  {record['scan_start_utc']}: missing {', '.join(record['missing_channels'])}")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"Saved {args.report}")
    if result["complete_scan_count"] < args.min_complete:
        raise SystemExit(
            f"Insufficient complete four-channel inputs: require at least {args.min_complete}"
        )
    if result["incomplete_scan_count"]:
        raise SystemExit("Incomplete ABI scan bins require investigation before inference.")


if __name__ == "__main__":
    main()

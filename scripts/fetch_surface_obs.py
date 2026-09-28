from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
from io import StringIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


IEM_ASOS_URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"


def parse_clock(value: str):
    return datetime.strptime(value, "%H:%M").time()


def parse_valid(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download historical ASOS/METAR observations from the Iowa Environmental Mesonet."
    )
    parser.add_argument("--network", default="LA_ASOS")
    parser.add_argument("--stations", nargs="+", required=True)
    parser.add_argument("--date", required=True, help="UTC date YYYY-MM-DD")
    parser.add_argument("--start", default="00:00", help="UTC start HH:MM")
    parser.add_argument("--end", default="23:59", help="UTC end HH:MM")
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    day = datetime.strptime(args.date, "%Y-%m-%d").date()
    start_dt = datetime.combine(day, parse_clock(args.start), tzinfo=timezone.utc)
    end_dt = datetime.combine(day, parse_clock(args.end), tzinfo=timezone.utc)
    if end_dt < start_dt:
        raise SystemExit("--end must not be earlier than --start")

    next_day = day + timedelta(days=1)
    params = [
        ("network", args.network),
        ("data", "all"),
        ("year1", str(day.year)),
        ("month1", str(day.month)),
        ("day1", str(day.day)),
        ("year2", str(next_day.year)),
        ("month2", str(next_day.month)),
        ("day2", str(next_day.day)),
        ("tz", "Etc/UTC"),
        ("format", "onlycomma"),
        ("latlon", "yes"),
        ("elev", "yes"),
        ("missing", "M"),
        ("trace", "T"),
        ("direct", "no"),
        ("report_type", "3"),
        ("report_type", "4"),
    ]
    params.extend(("station", station.upper()) for station in args.stations)
    url = f"{IEM_ASOS_URL}?{urlencode(params)}"

    print(f"Requesting {args.network}: {', '.join(args.stations)}")
    with urlopen(url, timeout=120) as response:
        raw = response.read().decode("utf-8")

    lines = [line for line in raw.splitlines() if line and not line.startswith("#")]
    reader = csv.DictReader(StringIO("\n".join(lines)))
    rows = []
    for row in reader:
        valid = parse_valid(row.get("valid", ""))
        if valid is None or not (start_dt <= valid <= end_dt):
            continue
        rows.append(row)

    if not rows:
        raise SystemExit("No observations matched the requested stations/window.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=reader.fieldnames or list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} observations to {args.output}")


if __name__ == "__main__":
    main()

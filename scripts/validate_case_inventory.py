from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import re

import yaml


NEXRAD_RE = re.compile(r"([A-Z0-9]{4})(\d{8})_(\d{6})")
GOES_RE = re.compile(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)")
MRMS_RE = re.compile(r"_(\d{8})-(\d{6})")
RAP_RE = re.compile(r"rap\\.t(\\d{2})z")


def nexrad_time(path: Path) -> datetime | None:
    match = NEXRAD_RE.search(path.name)
    if not match:
        return None
    return datetime.strptime(
        f"{match.group(2)}{match.group(3)}",
        "%Y%m%d%H%M%S",
    ).replace(tzinfo=timezone.utc)


def goes_time(path: Path) -> datetime | None:
    match = GOES_RE.search(path.name)
    if not match:
        return None
    base = datetime.strptime(f"{match.group(1)}{match.group(2)}", "%Y%j")
    return base.replace(
        hour=int(match.group(3)),
        minute=int(match.group(4)),
        second=int(match.group(5)),
        microsecond=int(match.group(6)) * 100_000,
        tzinfo=timezone.utc,
    )


def mrms_time(path: Path) -> datetime | None:
    match = MRMS_RE.search(path.name)
    if not match:
        return None
    return datetime.strptime(
        f"{match.group(1)}{match.group(2)}",
        "%Y%m%d%H%M%S",
    ).replace(tzinfo=timezone.utc)


def summarize_directory(path: Path, parser) -> dict:
    if not path.exists():
        return {"status": "missing", "count": 0}
    files = [item for item in path.rglob("*") if item.is_file()]
    times = [value for item in files if (value := parser(item)) is not None]
    return {
        "status": "ok" if files else "empty",
        "count": len(files),
        "first": min(times).isoformat() if times else None,
        "last": max(times).isoformat() if times else None,
        "bytes": sum(item.stat().st_size for item in files),
    }


def rap_time(path: Path, source_date: str) -> datetime | None:
    match = RAP_RE.search(path.name)
    if not match:
        return None
    day = datetime.strptime(source_date, "%Y-%m-%d")
    return day.replace(hour=int(match.group(1)), tzinfo=timezone.utc)


def summarize_observations(path: Path, stations: list[str]) -> dict:
    if not path.exists():
        return {"status": "missing", "count": 0, "stations": {}}

    counts = {station: 0 for station in stations}
    valid_times: list[datetime] = []
    with path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = 0
        for row in reader:
            rows += 1
            station = (row.get("station") or "").upper()
            if station in counts:
                counts[station] += 1
            value = (row.get("valid") or "").strip()
            try:
                parsed = datetime.fromisoformat(value)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                valid_times.append(parsed.astimezone(timezone.utc))
            except ValueError:
                pass

    return {
        "status": "ok" if rows else "empty",
        "count": rows,
        "stations": counts,
        "first": min(valid_times).isoformat() if valid_times else None,
        "last": max(valid_times).isoformat() if valid_times else None,
        "bytes": path.stat().st_size,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inventory raw Endymion source-case data after acquisition."
    )
    parser.add_argument(
        "--case",
        type=Path,
        default=Path("scenarios/mardi-gras/source-case.yaml"),
    )
    parser.add_argument("--strict", action="store_true")
    parser.add_argument(
        "--skip-lightningcast-inputs",
        action="store_true",
        help="Do not require archived ABI L1b LightningCast inputs in strict mode.",
    )
    parser.add_argument("--json", dest="json_output", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with args.case.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)

    datasets = config["datasets"]
    report = {
        "source_case": config["source_case"]["id"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "datasets": {},
    }

    report["datasets"]["nexrad"] = summarize_directory(
        Path(datasets["nexrad"]["output"]),
        nexrad_time,
    )
    report["datasets"]["environment"] = summarize_directory(
        Path(datasets["environment"]["output"]),
        lambda path: rap_time(path, config["source_case"]["source_date"]),
    )
    report["datasets"]["goes_display"] = summarize_directory(
        Path(datasets["goes_display"]["output"]),
        goes_time,
    )
    report["datasets"]["glm"] = summarize_directory(
        Path(datasets["glm"]["output"]),
        goes_time,
    )
    report["datasets"]["lightningcast_inputs"] = summarize_directory(
        Path(datasets["lightningcast_inputs"]["output"]),
        goes_time,
    )

    mrms_root = Path(datasets["mrms"]["output"])
    report["datasets"]["mrms"] = {
        product: summarize_directory(mrms_root / product, mrms_time)
        for product in datasets["mrms"]["products"]
    }

    obs = datasets["surface_observations"]
    report["datasets"]["surface_observations"] = summarize_observations(
        Path(obs["output"]),
        [station.upper() for station in obs["stations"]],
    )

    print(json.dumps(report, indent=2))
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if args.strict:
        failures = []
        required = ["nexrad", "goes_display", "glm", "environment"]
        if not args.skip_lightningcast_inputs:
            required.append("lightningcast_inputs")
        for key in required:
            if report["datasets"][key]["status"] != "ok":
                failures.append(key)
        for product, summary in report["datasets"]["mrms"].items():
            if summary["status"] != "ok":
                failures.append(f"mrms:{product}")
        if report["datasets"]["surface_observations"]["status"] != "ok":
            failures.append("surface_observations")
        if failures:
            raise SystemExit("Missing/empty required raw datasets: " + ", ".join(failures))


if __name__ == "__main__":
    main()

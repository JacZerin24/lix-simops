from pathlib import Path

import yaml

from backend.app.services.scenario_loader import load_scenario


def load_source_case() -> dict:
    path = Path("scenarios/mardi-gras/source-case.yaml")
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def test_endymion_scenario_links_source_case() -> None:
    scenario = load_scenario("scenarios/mardi-gras/scenario.yaml")
    assert scenario.source_case_file == "source-case.yaml"


def test_source_case_defines_required_raw_datasets() -> None:
    payload = load_source_case()

    assert payload["source_case"]["source_date"] == "2021-05-12"
    assert payload["source_case"]["source_window_utc"] == {
        "start": "06:00",
        "end": "07:45",
    }

    datasets = payload["datasets"]
    assert datasets["nexrad"]["radar"] == "KLIX"
    assert datasets["goes_display"]["product"] == "ABI-L2-CMIPC"
    assert datasets["glm"]["product"] == "GLM-L2-LCFA"
    assert datasets["lightningcast_inputs"]["channels"] == [2, 5, 13, 15]
    assert "MESH_00.50" in datasets["mrms"]["products"]
    assert "MergedAzShear_0-2kmAGL_00.50" in datasets["mrms"]["products"]


def test_environment_fallback_is_official_rap_analysis() -> None:
    datasets = load_source_case()["datasets"]
    environment = datasets["environment"]

    assert environment["status"] == "rap_fallback_selected"
    assert environment["source"] == "NOAA Rapid Refresh Open Data on AWS"
    assert environment["cycles_utc"] == [5, 6, 7]
    assert "RAP 90-mb Mixed-Layer CAPE" in environment["derived_products"]
    assert "RAP 0-6 km Bulk Shear" in environment["derived_products"]
    assert "RAP 0-1 km Storm-Relative Helicity" in environment["derived_products"]


def test_primary_tornado_anchor_matches_exercise_decision_period() -> None:
    payload = load_source_case()

    primary = next(
        item for item in payload["anchor_events"]
        if item["id"] == "new-orleans-ef0"
    )
    assert primary["start_local"] == "02:05"
    assert primary["end_local"] == "02:12"
    assert primary["mapped_start_local"] == "15:50"
    assert primary["mapped_end_local"] == "15:57"
    assert payload["source_case"]["exercise_mapping"]["local_time_offset_minutes"] == 825

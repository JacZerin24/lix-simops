from pathlib import Path

import yaml

from backend.app.services.scenario_loader import load_scenario


def test_endymion_scenario_links_source_case() -> None:
    scenario = load_scenario("scenarios/mardi-gras/scenario.yaml")
    assert scenario.source_case_file == "source-case.yaml"


def test_source_case_defines_required_raw_datasets() -> None:
    path = Path("scenarios/mardi-gras/source-case.yaml")
    with path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)

    assert payload["source_case"]["source_date"] == "2022-12-14"
    assert payload["source_case"]["source_window_utc"] == {
        "start": "20:30",
        "end": "22:45",
    }

    datasets = payload["datasets"]
    assert datasets["nexrad"]["radar"] == "KLIX"
    assert datasets["goes_display"]["product"] == "ABI-L2-CMIPC"
    assert datasets["glm"]["product"] == "GLM-L2-LCFA"
    assert datasets["lightningcast_inputs"]["channels"] == [2, 5, 13, 15]
    assert "MESH_00.50" in datasets["mrms"]["products"]
    assert "MergedAzShear_0-2kmAGL_00.50" in datasets["mrms"]["products"]


def test_primary_tornado_anchor_matches_exercise_decision_period() -> None:
    path = Path("scenarios/mardi-gras/source-case.yaml")
    with path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)

    primary = next(
        item for item in payload["anchor_events"]
        if item["id"] == "marrero-arabi-ef2"
    )
    assert primary["start_local"] == "15:49"
    assert primary["end_local"] == "16:06"

from pathlib import Path

import yaml

from backend.app.services.scenario_loader import load_scenario


def load_source_case() -> dict:
    path = Path("scenarios/mardi-gras/source-case.yaml")
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_injects() -> dict:
    path = Path("scenarios/mardi-gras/injects.yaml")
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def hhmm_minutes(value: str) -> int:
    hour, minute = (int(part) for part in value.split(":"))
    return hour * 60 + minute


def relative_minutes(value: str) -> int:
    assert value.startswith("T+")
    hour, minute, second = (int(part) for part in value[2:].split(":"))
    assert second == 0
    return hour * 60 + minute


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


def test_historical_report_timeline_matches_live_scenario_mapping() -> None:
    payload = load_source_case()
    timeline = payload["historical_report_timeline"]
    source_reports = {item["id"]: item for item in timeline["reports"]}
    live_reports = {
        item["id"]: item
        for item in load_injects()["injects"]
        if item.get("kind") == "storm_report"
    }

    assert len(source_reports) == 6
    assert set(live_reports) == set(source_reports)
    assert "EF0" not in " ".join(item["title"] for item in live_reports.values())

    offset = payload["source_case"]["exercise_mapping"]["local_time_offset_minutes"]
    simulation_start = hhmm_minutes(
        payload["source_case"]["exercise_mapping"]["simulation_start_local"]
    )

    for report_id, source_report in source_reports.items():
        live_report = live_reports[report_id]
        source_event = hhmm_minutes(source_report["source_event_local"])
        mapped_observed = hhmm_minutes(source_report["mapped_observed_local"])
        release = hhmm_minutes(source_report["exercise_release_local"])

        assert source_event + offset == mapped_observed
        assert (
            relative_minutes(live_report["observed_at_sim_time"])
            == mapped_observed - simulation_start
        )
        assert relative_minutes(live_report["at_sim_time"]) == release - simulation_start
        assert release - mapped_observed in {1, 2}
        assert "iem_lsr_archive" in source_report["provenance"]


def test_historical_report_provenance_documents_event_vs_delivery_time() -> None:
    timeline = load_source_case()["historical_report_timeline"]
    references = timeline["source_references"]
    iem = references["iem_lsr_archive"]

    assert "wfo=LIX" in iem["case_query"]
    assert "2021-05-12T06:00Z" in iem["case_query"]
    assert "2021-05-12T07:45Z" in iem["case_query"]
    assert "valid/event times" in iem["limitation"]
    assert "issuance time" in iem["limitation"]
    assert "exact historical LSR product-ingest timestamps" in timeline["provenance_note"]

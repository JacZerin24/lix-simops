from datetime import datetime, timedelta, timezone

from backend.app.services.scenario_loader import (
    load_scenario_by_id,
    load_scheduled_events,
)
from backend.app.state import SessionManager


def build_session():
    scenario = load_scenario_by_id("mardi-gras-dss-001")
    start = datetime.fromisoformat(scenario.simulation.start.replace("Z", "+00:00"))
    manager = SessionManager()
    return manager.create(
        scenario_id=scenario.id,
        scenario_name=scenario.name,
        scenario_start=start,
        default_speed=scenario.simulation.default_speed,
        scheduled_events=load_scheduled_events(scenario),
    )


def test_endymion_schedule_loads_automatic_and_manual_items() -> None:
    session = build_session()

    assert len(session.schedule) >= 9
    assert any(item.due_at is None for item in session.schedule)
    assert any(item.due_at is not None for item in session.schedule)


def test_schedule_is_hidden_from_default_session_snapshot() -> None:
    session = build_session()

    public_snapshot = session.session_snapshot()
    facilitator_snapshot = session.session_snapshot(include_schedule=True)

    assert "schedule" not in public_snapshot
    assert len(facilitator_snapshot["schedule"]) == len(session.schedule)


def test_due_items_follow_simulation_clock() -> None:
    session = build_session()
    session.sim_time = session.scenario_start + timedelta(minutes=6)

    due = session.due_items()

    assert [item.definition.id for item in due] == ["operations-checkin"]


def test_reset_restores_scenario_speed_and_pending_schedule() -> None:
    session = build_session()
    session.running = True
    session.speed = 4.0
    session.schedule[0].status = "released"
    session.log.append({"type": "inject"})

    session.reset_clock()

    assert session.sim_time == session.scenario_start
    assert session.running is False
    assert session.speed == 1.5
    assert session.log == []
    assert all(item.status == "pending" for item in session.schedule)



def test_endymion_historical_reports_are_curated_and_displaced() -> None:
    session = build_session()
    reports = [
        item
        for item in session.schedule
        if item.definition.kind == "storm_report"
    ]

    assert len(reports) == 6
    assert [item.definition.id for item in reports] == [
        "report-downtown-62mph",
        "report-pine-spruce-roof",
        "report-claiborne-calhoun-tree",
        "report-cohn-lowerline-damage",
        "report-bouny-power-pole",
        "report-behrman-opelousas-debris",
    ]

    first = reports[0]
    assert first.due_at == session.scenario_start + timedelta(minutes=70)
    assert first.definition.observed_at_sim_time == "T+01:09:00"
    assert first.definition.magnitude == "62 mph"

    # The live participant timeline must not leak the later NWS survey result.
    assert all(item.definition.report_kind != "tornado" for item in reports)
    assert all("EF0" not in item.definition.body.upper() for item in reports)

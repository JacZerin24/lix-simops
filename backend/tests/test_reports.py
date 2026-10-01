import asyncio
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.app.main import app, event_visible_to, release_scheduled_item
from backend.app.models import Role
from backend.app.state import Participant, SessionManager
from simulator.scenarios.schema import ScheduledExerciseEvent


def receive_type(socket, expected: str) -> dict:
    for _ in range(12):
        message = socket.receive_json()
        if message.get("type") == expected:
            return message
    raise AssertionError(f"Did not receive {expected}")


def test_scheduled_storm_report_preserves_observation_and_release_times() -> None:
    start = datetime(2027, 2, 6, 20, 45, tzinfo=timezone.utc)
    definition = ScheduledExerciseEvent(
        id="test-hail",
        at_sim_time="T+00:10:00",
        kind="storm_report",
        title="Hail Report",
        body="Quarter-size hail reported.",
        audience="radar",
        report_kind="hail",
        lat=29.95,
        lon=-90.10,
        magnitude='1.00" hail',
        source="Trained spotter",
        observed_at_sim_time="T+00:07:00",
        plot_on_radar=True,
        display_minutes=60,
    )
    manager = SessionManager()
    state = manager.create(
        scenario_id="test",
        scenario_name="Test",
        scenario_start=start,
        default_speed=1.0,
        scheduled_events=[definition],
    )
    state.sim_time = start.replace(minute=55)

    asyncio.run(release_scheduled_item(state, state.schedule[0]))

    report = state.log[0]
    assert report["type"] == "storm_report"
    assert report["report_kind"] == "hail"
    assert report["observed_at"] == "2027-02-06T20:52:00+00:00"
    assert report["sim_time"] == "2027-02-06T20:55:00+00:00"
    assert report["expires_at"] == "2027-02-06T21:55:00+00:00"
    assert report["plot_on_radar"] is True
    assert state.schedule[0].status == "released"


def test_storm_report_visibility_respects_team_and_role() -> None:
    event = {
        "type": "storm_report",
        "audience": "radar",
        "target_team_id": "Team 1",
    }
    team_one_radar = Participant(
        id="radar-1",
        display_name="Radar 1",
        team_id="Team 1",
        role=Role.RADAR,
    )
    team_two_radar = Participant(
        id="radar-2",
        display_name="Radar 2",
        team_id="Team 2",
        role=Role.RADAR,
    )
    team_one_meso = Participant(
        id="meso-1",
        display_name="Meso 1",
        team_id="Team 1",
        role=Role.MESO,
    )
    facilitator = Participant(
        id="fac",
        display_name="Fac",
        team_id="FACILITATOR",
        role=Role.FACILITATOR,
    )

    assert event_visible_to(event, team_one_radar) is True
    assert event_visible_to(event, team_two_radar) is False
    assert event_visible_to(event, team_one_meso) is False
    assert event_visible_to(event, facilitator) is True


def test_facilitator_can_release_manual_storm_report() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        code = created["session_code"]

        with client.websocket_connect(
            f"/ws/{code}?display_name=Radar&team_id=Team+1&role=radar"
        ) as radar:
            receive_type(radar, "session_state")
            receive_type(radar, "event_history")
            receive_type(radar, "warning_state")

            with client.websocket_connect(
                f"/ws/{code}?display_name=Fac&team_id=FACILITATOR&role=facilitator"
            ) as facilitator:
                receive_type(facilitator, "session_state")
                receive_type(facilitator, "event_history")
                receive_type(facilitator, "warning_state")

                facilitator.send_json(
                    {
                        "type": "storm_report",
                        "title": "Wind Damage Report",
                        "body": "Large limbs down.",
                        "audience": "radar",
                        "target_team_id": "Team 1",
                        "report_kind": "wind",
                        "lat": 29.96,
                        "lon": -90.12,
                        "magnitude": "70 mph",
                        "source": "Emergency management",
                        "plot_on_radar": True,
                        "display_minutes": 60,
                    }
                )

                report = receive_type(radar, "storm_report")
                assert report["report_kind"] == "wind"
                assert report["magnitude"] == "70 mph"
                assert report["source"] == "Emergency management"
                assert report["plot_on_radar"] is True
                assert report["target_team_id"] == "Team 1"


def test_non_facilitator_cannot_release_storm_report() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        code = created["session_code"]

        with client.websocket_connect(
            f"/ws/{code}?display_name=Radar&team_id=Team+1&role=radar"
        ) as socket:
            receive_type(socket, "session_state")
            receive_type(socket, "event_history")
            receive_type(socket, "warning_state")

            socket.send_json(
                {
                    "type": "storm_report",
                    "report_kind": "hail",
                    "lat": 29.95,
                    "lon": -90.10,
                }
            )
            error = receive_type(socket, "error")
            assert "facilitator" in error["message"].lower()

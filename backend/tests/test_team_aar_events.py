from fastapi.testclient import TestClient

from backend.app.main import app, event_visible_to
from backend.app.models import Role
from backend.app.state import Participant, manager


def receive_type(socket, expected: str) -> dict:
    for _ in range(16):
        message = socket.receive_json()
        if message.get("type") == expected:
            return message
    raise AssertionError(f"Did not receive {expected}")


def consume_initial(socket) -> None:
    receive_type(socket, "session_state")
    receive_type(socket, "event_history")
    receive_type(socket, "warning_state")


def test_team_aar_event_visibility_is_team_scoped() -> None:
    meso_event = {"type": "meso_update", "team_id": "Team 1"}
    shift_event = {"type": "shift_log_update", "team_id": "Team 1"}
    team_one = Participant(
        id="one",
        display_name="One",
        team_id="Team 1",
        role=Role.RADAR,
    )
    team_two = Participant(
        id="two",
        display_name="Two",
        team_id="Team 2",
        role=Role.DSS,
    )
    facilitator = Participant(
        id="fac",
        display_name="Fac",
        team_id="FACILITATOR",
        role=Role.FACILITATOR,
    )

    assert event_visible_to(meso_event, team_one) is True
    assert event_visible_to(shift_event, team_one) is True
    assert event_visible_to(meso_event, team_two) is False
    assert event_visible_to(shift_event, team_two) is False
    assert event_visible_to(meso_event, facilitator) is True
    assert event_visible_to(shift_event, facilitator) is True


def test_dss_can_mark_shift_log_update() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        code = created["session_code"]

        with client.websocket_connect(
            f"/ws/{code}?display_name=DSS&team_id=Team+1&role=dss"
        ) as socket:
            consume_initial(socket)
            socket.send_json({"type": "shift_log_update"})
            event = receive_type(socket, "shift_log_update")

            assert event["team_id"] == "Team 1"
            assert event["sender"] == "DSS"
            assert event["body"] == "Shift log entry submitted."

            session = manager.get(code)
            assert session is not None
            assert session.log[-1]["type"] == "shift_log_update"


def test_meso_update_preserves_product_and_frame_context() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        code = created["session_code"]

        with client.websocket_connect(
            f"/ws/{code}?display_name=Meso&team_id=Team+1&role=mesoanalyst"
        ) as socket:
            consume_initial(socket)
            socket.send_json(
                {
                    "type": "meso_update",
                    "body": "Low-level shear is increasing near the event corridor.",
                    "category": "Environment",
                    "product_id": "rap-01km-srh",
                    "product_label": "RAP 0-1 km SRH",
                    "frame_time": "2027-02-06T21:45:00+00:00",
                }
            )
            event = receive_type(socket, "meso_update")

            assert event["team_id"] == "Team 1"
            assert event["product_id"] == "rap-01km-srh"
            assert event["product_label"] == "RAP 0-1 km SRH"
            assert event["frame_time"] == "2027-02-06T21:45:00+00:00"
            assert "shear" in event["body"]


def test_role_guards_for_team_aar_events() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        code = created["session_code"]

        with client.websocket_connect(
            f"/ws/{code}?display_name=Radar&team_id=Team+1&role=radar"
        ) as radar:
            consume_initial(radar)
            radar.send_json({"type": "shift_log_update"})
            error = receive_type(radar, "error")
            assert "DSS" in error["message"]

            radar.send_json({"type": "meso_update", "body": "Not allowed"})
            error = receive_type(radar, "error")
            assert "Mesoanalyst" in error["message"]

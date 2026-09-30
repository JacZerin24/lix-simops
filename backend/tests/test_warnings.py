from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.state import manager


def receive_type(socket, expected: str) -> dict:
    for _ in range(10):
        message = socket.receive_json()
        if message.get("type") == expected:
            return message
    raise AssertionError(f"Did not receive {expected}")


def test_radar_warning_is_team_scoped_and_reset_clears_it() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        code = created["session_code"]

        with client.websocket_connect(
            f"/ws/{code}?display_name=Radar+One&team_id=Team+1&role=radar"
        ) as team_one:
            receive_type(team_one, "session_state")
            receive_type(team_one, "event_history")
            initial_one = receive_type(team_one, "warning_state")
            assert initial_one["warnings"] == []

            with client.websocket_connect(
                f"/ws/{code}?display_name=Radar+Two&team_id=Team+2&role=radar"
            ) as team_two:
                receive_type(team_two, "session_state")
                receive_type(team_two, "event_history")
                initial_two = receive_type(team_two, "warning_state")
                assert initial_two["warnings"] == []

                team_one.send_json(
                    {
                        "type": "warning_issue",
                        "hazard": "TOR",
                        "duration_minutes": 30,
                        "points": [
                            {"lat": 29.95, "lon": -90.20},
                            {"lat": 30.00, "lon": -90.10},
                            {"lat": 29.90, "lon": -90.05},
                        ],
                    }
                )

                warning_one = receive_type(team_one, "warning_state")
                warning_two = receive_type(team_two, "warning_state")

                assert len(warning_one["warnings"]) == 1
                assert warning_one["warnings"][0]["hazard"] == "TOR"
                assert warning_one["warnings"][0]["team_id"] == "Team 1"
                assert warning_two["warnings"] == []

                session = manager.get(code)
                assert session is not None
                assert len(session.warnings) == 1
                assert session.warnings[0].issuer == "Radar One"

                session.reset_clock()
                assert session.warnings == []


def test_non_radar_role_cannot_issue_warning() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        code = created["session_code"]

        with client.websocket_connect(
            f"/ws/{code}?display_name=Meso&team_id=Team+1&role=mesoanalyst"
        ) as socket:
            receive_type(socket, "session_state")
            receive_type(socket, "event_history")
            receive_type(socket, "warning_state")

            socket.send_json(
                {
                    "type": "warning_issue",
                    "hazard": "SVR",
                    "duration_minutes": 30,
                    "points": [
                        {"lat": 29.95, "lon": -90.20},
                        {"lat": 30.00, "lon": -90.10},
                        {"lat": 29.90, "lon": -90.05},
                    ],
                }
            )

            error = receive_type(socket, "error")
            assert "Radar Operator" in error["message"]

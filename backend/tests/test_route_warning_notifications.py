"""Endymion warning overlap and DSS websocket routing acceptance tests."""
from fastapi.testclient import TestClient

from backend.app.main import app, event_visible_to
from backend.app.models import Role
from backend.app.services.route_warnings import (
    route_centerline_from_config,
    warning_intersects_route,
)
from backend.app.services.scenario_loader import load_event_config, load_scenario_by_id
from backend.app.state import Participant, manager


def rectangle(west: float, east: float, south: float, north: float) -> list[dict]:
    return [
        {"lon": west, "lat": south},
        {"lon": east, "lat": south},
        {"lon": east, "lat": north},
        {"lon": west, "lat": north},
    ]


def receive_type(socket, name: str) -> dict:
    for _ in range(16):
        packet = socket.receive_json()
        if packet.get("type") == name:
            return packet
    raise AssertionError(f"Missing event {name}")


def handshake(socket) -> None:
    receive_type(socket, "session_state")
    receive_type(socket, "event_history")
    receive_type(socket, "warning_state")


def route_points() -> list[dict[str, float]]:
    scenario = load_scenario_by_id("mardi-gras-dss-001")
    return route_centerline_from_config(load_event_config(scenario))


def test_polygon_covers_endymion_start() -> None:
    assert warning_intersects_route(
        rectangle(-90.12, -90.09, 29.97, 30.00), route_points()
    )


def test_polygon_covers_downtown_route_but_not_start() -> None:
    route = route_points()
    assert not (-90.09 <= route[0]["lon"] <= -90.06)
    assert warning_intersects_route(
        rectangle(-90.085, -90.065, 29.94, 29.96), route
    )


def test_polygon_crosses_route_between_waypoints_with_neither_endpoint_inside() -> None:
    route = [{"lon": -90.2, "lat": 29.9}, {"lon": -90.0, "lat": 29.9}]
    polygon = rectangle(-90.11, -90.09, 29.89, 29.91)
    assert warning_intersects_route(polygon, route)


def test_polygon_unrelated_to_route_does_not_trigger() -> None:
    assert not warning_intersects_route(
        rectangle(-91.1, -90.8, 30.3, 30.6), route_points()
    )


def test_team_only_route_alert_is_role_and_team_scoped() -> None:
    notice = {"type": "warning_route_notice", "team_id": "Team 1"}
    def user(role: Role, team: str) -> Participant:
        return Participant(id="p", display_name="P", role=role, team_id=team)
    assert event_visible_to(notice, user(Role.DSS, "Team 1"))
    assert not event_visible_to(notice, user(Role.DSS, "Team 2"))
    assert not event_visible_to(notice, user(Role.RADAR, "Team 1"))
    assert not event_visible_to(notice, user(Role.MESO, "Team 1"))


def test_warned_route_sends_live_dss_alert_and_restores_chat_history() -> None:
    with TestClient(app) as client:
        code = client.post("/api/sessions", json={
            "scenario_id": "mardi-gras-dss-001",
        }).json()["session_code"]
        with client.websocket_connect(
            f"/ws/{code}?display_name=DSS1&team_id=Team+1&role=dss"
        ) as dss:
            handshake(dss)
            with client.websocket_connect(
                f"/ws/{code}?display_name=Radar1&team_id=Team+1&role=radar"
            ) as radar:
                handshake(radar)
                radar.send_json({
                    "type": "warning_issue",
                    "hazard": "SVR",
                    "points": rectangle(-90.085, -90.065, 29.94, 29.96),
                    "duration_minutes": 30,
                    "text": "THIS IS AN EXERCISE",
                    "attributes": {"track_type": "one_storm"},
                })
                notice = receive_type(dss, "warning_route_notice")
                assert notice["hazard"] == "SVR"
                assert notice["warning_text"] == "THIS IS AN EXERCISE"
                assert "CST" in notice["body"]
                assert notice["team_id"] == "Team 1"
                assert "route" in notice["body"].lower()
                assert "Unified Command" in notice["body"]
                snapshot = receive_type(radar, "warning_state")
                warning_id = snapshot["warnings"][0]["id"]
                radar.send_json({
                    "type": "warning_followup",
                    "warning_id": warning_id,
                    "action": "CAN",
                    "text": "THIS IS AN EXERCISE: warning cancelled",
                })
                followup = receive_type(dss, "warning_route_notice")
                assert followup["action"] == "CAN"
                assert followup["warning_text"] == "THIS IS AN EXERCISE: warning cancelled"
                assert "cancelled" in followup["body"]
        # Late join/reconnect must retrieve the alert for the correct DSS
        with client.websocket_connect(
            f"/ws/{code}?display_name=DSS2&team_id=Team+2&role=dss"
        ) as dss2:
            receive_type(dss2, "session_state")
            history = receive_type(dss2, "event_history")["events"]
            assert not any(e.get("type") == "warning_route_notice" for e in history)
        with client.websocket_connect(
            f"/ws/{code}?display_name=DSS1B&team_id=Team+1&role=dss"
        ) as dss1:
            receive_type(dss1, "session_state")
            history = receive_type(dss1, "event_history")["events"]
            alerts = [e for e in history if e.get("type") == "warning_route_notice"]
            assert [e["action"] for e in alerts] == ["issue", "CAN"]


def test_warning_elsewhere_does_not_notify_route_chat() -> None:
    with TestClient(app) as client:
        code = client.post("/api/sessions", json={
            "scenario_id": "mardi-gras-dss-001",
        }).json()["session_code"]
        with client.websocket_connect(
            f"/ws/{code}?display_name=Radar&team_id=Team+1&role=radar"
        ) as radar:
            handshake(radar)
            radar.send_json({
                "type": "warning_issue",
                "hazard": "TOR",
                "points": rectangle(-91.1, -90.8, 30.3, 30.6),
                "duration_minutes": 30,
                "text": "THIS IS AN EXERCISE",
                "attributes": {"track_type": "one_storm"},
            })
            receive_type(radar, "warning_state")
            state = manager.get(code)
            assert state is not None
            assert not any(e.get("type") == "warning_route_notice" for e in state.log)

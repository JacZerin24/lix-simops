"""DSS warning-footprint map receives the authored training route."""
from fastapi.testclient import TestClient

from backend.app.main import app


def test_event_api_exposes_parade_route_coordinates_and_training_caveat() -> None:
    with TestClient(app) as client:
        response = client.post("/api/sessions", json={
            "scenario_id": "mardi-gras-dss-001",
        })
        assert response.status_code == 200
        session_code = response.json()["session_code"]
        route_response = client.get(f"/api/sessions/{session_code}/event")
        assert route_response.status_code == 200
        event = route_response.json()["event"]
        route = event["route_centerline"]
        assert len(route) >= 5
        assert all(-91 < p["lon"] < -89 and 29 < p["lat"] < 31 for p in route)
        assert route[0]["lat"] == 29.9864
        assert "Approximate" in event["route_geometry_note"]

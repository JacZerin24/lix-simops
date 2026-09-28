from fastapi.testclient import TestClient

from backend.app.main import app


def test_scenarios_are_discoverable() -> None:
    with TestClient(app) as client:
        response = client.get("/api/scenarios")

    assert response.status_code == 200
    scenarios = response.json()
    assert any(item["id"] == "mardi-gras-dss-001" for item in scenarios)


def test_session_can_be_created_from_scenario() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["session_code"]) == 6
    assert payload["scenario_id"] == "mardi-gras-dss-001"
    assert payload["scenario_name"] == "2027 Endymion Severe Weather DSS Exercise"
    assert payload["running"] is False


def test_unknown_scenario_returns_404() -> None:
    with TestClient(app) as client:
        response = client.post("/api/sessions", json={"scenario_id": "not-real"})

    assert response.status_code == 404

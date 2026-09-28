from fastapi.testclient import TestClient

from backend.app.main import app


def test_endymion_event_operations_are_available_to_session() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        response = client.get(
            f"/api/sessions/{created['session_code']}/event"
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["event"]["name"].startswith("Krewe of Endymion")
    assert payload["event"]["scheduled_start_local"] == "16:00"

    thresholds = payload["operations"]["decision_thresholds"]
    threshold_text = " ".join(item["threshold"] for item in thresholds)
    assert "15 miles" in threshold_text
    assert "12 miles" in threshold_text
    assert "8 miles" in threshold_text

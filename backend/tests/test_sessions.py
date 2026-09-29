from datetime import timedelta

from fastapi.testclient import TestClient

import backend.app.main as main_app
from backend.app.main import app
from backend.app.state import manager
from simulator.radar.manifest import RadarFrame, RadarManifest, RadarProduct


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
    assert payload["timezone"] == "America/Chicago"
    assert payload["running"] is False
    assert payload["facilitator_token"]

    session = manager.get(payload["session_code"])
    assert session is not None
    assert session.scenario_end.isoformat() == "2027-02-06T22:30:00+00:00"


def test_unknown_scenario_returns_404() -> None:
    with TestClient(app) as client:
        response = client.post("/api/sessions", json={"scenario_id": "not-real"})

    assert response.status_code == 404


def test_facilitator_role_requires_session_access_key() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()

        with client.websocket_connect(
            f"/ws/{created['session_code']}?display_name=Test&team_id=FACILITATOR&role=facilitator"
        ) as websocket:
            message = websocket.receive_json()

    assert message["type"] == "error"
    assert message["message"] == "Invalid facilitator access key"


def test_facilitator_role_accepts_valid_session_access_key() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()

        with client.websocket_connect(
            f"/ws/{created['session_code']}?display_name=Test&team_id=FACILITATOR"
            f"&role=facilitator&facilitator_token={created['facilitator_token']}"
        ) as websocket:
            message = websocket.receive_json()

    assert message["type"] == "session_state"
    assert "facilitator_token" not in message


def test_raw_cache_is_not_publicly_mounted() -> None:
    with TestClient(app) as client:
        response = client.get(
            "/scenario-data/mardi-gras-dss-001/radar/manifest.json"
        )

    assert response.status_code == 404


def test_participant_asset_route_blocks_future_frames(monkeypatch, tmp_path) -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        session = manager.get(created["session_code"])
        assert session is not None

        asset = "radar/frames/REF/0.5/future.png"
        asset_file = tmp_path / session.scenario_id / asset
        asset_file.parent.mkdir(parents=True)
        asset_file.write_bytes(b"not-a-real-png")

        future_time = session.sim_time + timedelta(minutes=5)
        manifest = RadarManifest(
            radar_site="KLIX",
            generated_at=session.sim_time,
            products=[
                RadarProduct(
                    id="REF",
                    label="Base Reflectivity",
                    field="reflectivity",
                    units="dBZ",
                )
            ],
            frames=[
                RadarFrame(
                    timestamp=future_time,
                    product="REF",
                    elevation=0.5,
                    asset=asset,
                )
            ],
        )
        monkeypatch.setattr(main_app, "CACHE_ROOT", tmp_path)
        monkeypatch.setattr(main_app, "load_radar_manifest", lambda _: manifest)
        monkeypatch.setattr(main_app, "load_meso_manifest", lambda _: None)

        before = client.get(
            f"/api/sessions/{session.code}/assets/{asset}"
        )
        assert before.status_code == 404

        session.sim_time = future_time
        available = client.get(
            f"/api/sessions/{session.code}/assets/{asset}"
        )

    assert available.status_code == 200
    assert available.content == b"not-a-real-png"

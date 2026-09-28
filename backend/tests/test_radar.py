from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.app.main import app
from simulator.radar.manifest import (
    RadarFrame,
    RadarManifest,
    RadarProduct,
    visible_frames,
)


def test_visible_frames_never_include_future_scans() -> None:
    manifest = RadarManifest(
        radar_site="KLIX",
        generated_at=datetime(2026, 9, 28, tzinfo=timezone.utc),
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
                timestamp=datetime(2026, 3, 11, 18, 0, tzinfo=timezone.utc),
                product="REF",
                elevation=0.5,
                asset="radar/frames/REF/0.5/1800.png",
            ),
            RadarFrame(
                timestamp=datetime(2026, 3, 11, 18, 5, tzinfo=timezone.utc),
                product="REF",
                elevation=0.5,
                asset="radar/frames/REF/0.5/1805.png",
            ),
        ],
    )

    visible = visible_frames(
        manifest,
        datetime(2026, 3, 11, 18, 2, tzinfo=timezone.utc),
        "REF",
        0.5,
    )

    assert len(visible) == 1
    assert visible[0].timestamp.minute == 0


def test_radar_endpoint_is_safe_when_cache_is_missing() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        response = client.get(
            f"/api/sessions/{created['session_code']}/radar/frames",
            params={"product": "REF", "elevation": 0.5},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is False
    assert payload["frames"] == []

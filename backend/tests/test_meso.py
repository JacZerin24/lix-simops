from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.app.main import app
from simulator.meso.manifest import (
    MesoFrame,
    MesoManifest,
    MesoProduct,
    visible_frames,
)


def test_meso_visible_frames_hide_future_products() -> None:
    manifest = MesoManifest(
        generated_at=datetime(2026, 9, 28, tzinfo=timezone.utc),
        products=[
            MesoProduct(
                id="lightningcast",
                label="LightningCast",
                category="Lightning",
            )
        ],
        frames=[
            MesoFrame(
                timestamp=datetime(2026, 3, 11, 18, 0, tzinfo=timezone.utc),
                product="lightningcast",
                asset="meso/frames/lightningcast/1800.png",
            ),
            MesoFrame(
                timestamp=datetime(2026, 3, 11, 18, 10, tzinfo=timezone.utc),
                product="lightningcast",
                asset="meso/frames/lightningcast/1810.png",
            ),
        ],
    )

    visible = visible_frames(
        manifest,
        datetime(2026, 3, 11, 18, 5, tzinfo=timezone.utc),
        "lightningcast",
    )

    assert len(visible) == 1
    assert visible[0].timestamp.minute == 0


def test_meso_endpoint_is_safe_when_cache_is_missing() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"scenario_id": "mardi-gras-dss-001"},
        ).json()
        response = client.get(
            f"/api/sessions/{created['session_code']}/meso/frames",
            params={"product": "lightningcast"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is False
    assert payload["frames"] == []

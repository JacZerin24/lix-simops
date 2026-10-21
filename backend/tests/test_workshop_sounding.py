"""Optional case-blind KMSY sounding serves only at/after simulation T=0."""

import json
from datetime import datetime, timedelta, timezone

from backend.app.services import meso_data
from backend.app.state import SessionState


def _exercise_session(start):
    return SessionState(
        code="DEMO12",
        scenario_id=meso_data.WORKSHOP_SCENARIO_ID,
        scenario_name="Endymion",
        scenario_start=start,
        sim_time=start,
        default_speed=1.5,
    )


def _meso_manifest(root):
    destination = root / meso_data.WORKSHOP_SCENARIO_ID / "meso" / "manifest.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({
        "generated_at": "2026-10-21T18:00:00Z",
        "products": [
            {
                "id": "mlcape",
                "label": "RAP 90-mb MLCAPE",
                "category": "Thermodynamics",
            }
        ],
        "frames": [
            {
                "timestamp": "2027-02-06T20:45:00Z",
                "product": "mlcape",
                "asset": "meso/frames/mlcape/first.png",
            }
        ],
    }), encoding="utf-8")


def test_optional_workshop_sounding_is_absent_without_file(tmp_path, monkeypatch):
    monkeypatch.setattr(meso_data, "CACHE_ROOT", tmp_path)
    _meso_manifest(tmp_path)
    start = meso_data.SOUNDING_VALID
    session = _exercise_session(start)

    assert meso_data.meso_asset_first_time(session.scenario_id, meso_data.SOUNDING_ASSET) is None
    response = meso_data.meso_payload(session)
    assert response["available"] is True
    assert [p["id"] for p in response["products"]] == ["mlcape"]


def test_workshop_sounding_is_time_gated_and_category_visible(tmp_path, monkeypatch):
    monkeypatch.setattr(meso_data, "CACHE_ROOT", tmp_path)
    _meso_manifest(tmp_path)
    image = tmp_path / meso_data.WORKSHOP_SCENARIO_ID / meso_data.SOUNDING_ASSET
    image.parent.mkdir(parents=True, exist_ok=True)
    image.write_bytes(b"\x89PNG\r\n\x1a\n")

    start = meso_data.SOUNDING_VALID
    session = _exercise_session(start - timedelta(minutes=1))
    assert meso_data.meso_asset_first_time(session.scenario_id, meso_data.SOUNDING_ASSET) == start
    response = meso_data.meso_payload(session, requested_product=meso_data.SOUNDING_ID)
    assert response["selected_product"] == meso_data.SOUNDING_ID
    assert response["frames"] == []
    assert [p["id"] for p in response["products"]] == ["mlcape", meso_data.SOUNDING_ID]
    assert response["categories"] == ["Thermodynamics"]

    session.sim_time = start
    visible = meso_data.meso_payload(session, requested_product=meso_data.SOUNDING_ID)
    assert len(visible["frames"]) == 1
    assert visible["frames"][0]["timestamp"] == start.isoformat()
    assert visible["frames"][0]["asset_url"] == (
        "/api/sessions/DEMO12/assets/" + meso_data.SOUNDING_ASSET
    )
    assert "May 2021" not in str(visible)
    assert "2021" not in str(visible)


def test_no_cross_scenario_access(tmp_path, monkeypatch):
    monkeypatch.setattr(meso_data, "CACHE_ROOT", tmp_path)
    image = tmp_path / meso_data.WORKSHOP_SCENARIO_ID / meso_data.SOUNDING_ASSET
    image.parent.mkdir(parents=True, exist_ok=True)
    image.write_bytes(b"image")
    assert meso_data.meso_asset_first_time("different-case", meso_data.SOUNDING_ASSET) is None
    assert meso_data.meso_asset_first_time(meso_data.WORKSHOP_SCENARIO_ID, "meso/other.png") is None

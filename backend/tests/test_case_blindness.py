from datetime import datetime, timezone

from backend.app.services import meso_data, radar_data
from backend.app.state import SessionManager
from simulator.meso.manifest import MesoFrame, MesoManifest, MesoProduct
from simulator.radar.manifest import RadarFrame, RadarManifest, RadarProduct


def make_session():
    manager = SessionManager()
    start = datetime(2027, 2, 6, 20, 45, tzinfo=timezone.utc)
    end = datetime(2027, 2, 6, 22, 30, tzinfo=timezone.utc)
    return manager.create(
        scenario_id="mardi-gras-dss-001",
        scenario_name="Endymion",
        scenario_start=start,
        scenario_end=end,
        default_speed=1.5,
    )


def test_radar_payload_does_not_expose_historical_source_key(monkeypatch) -> None:
    session = make_session()
    manifest = RadarManifest(
        radar_site="KLIX",
        generated_at=datetime.now(timezone.utc),
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
                timestamp=session.sim_time,
                product="REF",
                elevation=0.5,
                asset="radar/frames/REF/0.5/20270206T204500Z.png",
                source_key="KLIX20210512_070500_V06",
            )
        ],
    )
    monkeypatch.setattr(radar_data, "load_radar_manifest", lambda _: manifest)

    payload = radar_data.radar_payload(session, "REF", 0.5)

    assert payload["frames"]
    assert "source_key" not in payload["frames"][0]
    assert "20210512" not in str(payload)


def test_meso_payload_does_not_expose_historical_source_key(monkeypatch) -> None:
    session = make_session()
    manifest = MesoManifest(
        generated_at=datetime.now(timezone.utc),
        products=[
            MesoProduct(
                id="goes_ir",
                label="GOES IR",
                category="Satellite",
            )
        ],
        frames=[
            MesoFrame(
                timestamp=session.sim_time,
                product="goes_ir",
                asset="meso/frames/goes_ir/goes_ir_20270206T204500Z.png",
                source_key="OR_ABI-L2-CMIPC-M6C13_G16_s20211320705000.nc",
            )
        ],
    )
    monkeypatch.setattr(meso_data, "load_meso_manifest", lambda _: manifest)

    payload = meso_data.meso_payload(session, "goes_ir")

    assert payload["frames"]
    assert "source_key" not in payload["frames"][0]
    assert "2021132" not in str(payload)

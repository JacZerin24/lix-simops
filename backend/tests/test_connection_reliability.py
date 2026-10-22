"""Regression coverage for multi-team session stability and reconnects."""

import asyncio
from contextlib import ExitStack

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.main import app
from backend.app.models import Role
from backend.app.state import ClientConnection, Participant, SessionManager, manager


def receive_type(socket, expected: str) -> dict:
    for _ in range(50):
        payload = socket.receive_json()
        if payload.get("type") == expected:
            return payload
    raise AssertionError(f"Did not receive {expected}")


def consume_initial(socket) -> None:
    assert receive_type(socket, "session_state")["session_code"]
    receive_type(socket, "event_history")
    receive_type(socket, "warning_state")


def new_session(client: TestClient) -> str:
    response = client.post(
        "/api/sessions", json={"scenario_id": "mardi-gras-dss-001"}
    )
    assert response.status_code == 200
    return response.json()["session_code"]


def test_seven_live_clients_across_two_teams() -> None:
    with TestClient(app) as client:
        code = new_session(client)
        with ExitStack() as stack:
            sockets = {}
            for team, role in [
                ("FACILITATOR", "facilitator"),
                ("Team 1", "radar"),
                ("Team 1", "mesoanalyst"),
                ("Team 1", "dss"),
                ("Team 2", "radar"),
                ("Team 2", "mesoanalyst"),
                ("Team 2", "dss"),
            ]:
                url = (
                    f"/ws/{code}?display_name={team.replace(' ', '')}-{role}"
                    f"&team_id={team.replace(' ', '+')}&role={role}"
                )
                sockets[(team, role)] = stack.enter_context(
                    client.websocket_connect(url)
                )
                consume_initial(sockets[(team, role)])

            session = manager.get(code)
            assert session is not None
            assert len(session.clients) == 7

            # A targeted partner message is received by the correct DSS only.
            facilitator = sockets[("FACILITATOR", "facilitator")]
            facilitator.send_json({
                "type": "partner_message",
                "team_id": "Team 2",
                "sender": "Unified Command",
                "body": "How much lead time remains?",
            })
            partner = receive_type(sockets[("Team 2", "dss")], "partner_message")
            assert partner["team_id"] == "Team 2"

            # Meso update and DSS reply still work as seven clients stay joined.
            sockets[("Team 1", "mesoanalyst")].send_json({
                "type": "meso_update",
                "body": "Low-level shear increasing",
                "product_label": "RAP SRH",
                "frame_time": "2027-02-06T20:45:00Z",
            })
            update = receive_type(sockets[("Team 1", "dss")], "meso_update")
            assert update["team_id"] == "Team 1"
            sockets[("Team 2", "dss")].send_json({
                "type": "dss_response", "body": "Hold pending reassessment",
            })
            reply = receive_type(facilitator, "dss_response")
            assert reply["team_id"] == "Team 2"
            assert len(session.clients) == 7

            # Rejoin Team 1 after several Team 2 actions: history is isolated.
            extra = stack.enter_context(client.websocket_connect(
                f"/ws/{code}?display_name=Team1-Rejoin&team_id=Team+1&role=dss"
            ))
            receive_type(extra, "session_state")
            history = receive_type(extra, "event_history")["events"]
            assert any(event["type"] == "meso_update" for event in history)
            assert all(
                event.get("team_id") not in {"Team 2"}
                for event in history
            )


def test_reconnect_reuses_identity_without_duplicate_roster_entry() -> None:
    with TestClient(app) as client:
        code = new_session(client)
        url = (
            f"/ws/{code}?display_name=Radar&team_id=Team+1"
            "&role=radar&client_id=simops-tab-identity-1234"
        )
        with client.websocket_connect(url) as original:
            consume_initial(original)
            with client.websocket_connect(url) as replacement:
                consume_initial(replacement)
                session = manager.get(code)
                assert session is not None
                assert len(session.clients) == 1
                assert len(session.presence_snapshot()["participants"]) == 1
                assert (
                    session.clients["simops-tab-identity-1234"]
                    .websocket is not None
                )


def test_stalled_socket_cannot_block_healthy_team(monkeypatch) -> None:
    monkeypatch.setattr(main, "WS_SEND_TIMEOUT_SECONDS", 0.02)

    class Socket:
        def __init__(self, delay: float):
            self.delay = delay
            self.received: list[dict] = []

        async def send_json(self, payload):
            await asyncio.sleep(self.delay)
            self.received.append(payload)

    async def run():
        session = SessionManager().create(
            scenario_id="test", scenario_name="test",
            scenario_start=__import__("datetime").datetime(
                2027, 2, 6, tzinfo=__import__("datetime").timezone.utc
            ),
            default_speed=1.0,
        )
        slow = Socket(1.0)
        fast = Socket(0.0)
        session.clients["slow"] = ClientConnection(
            websocket=slow,
            participant=Participant("slow", "slow", "Team 1", Role.RADAR),
        )
        session.clients["fast"] = ClientConnection(
            websocket=fast,
            participant=Participant("fast", "fast", "Team 2", Role.DSS),
        )
        await main.send_to(session, {"type": "clock", "sim_time": "test"})
        assert fast.received[0]["type"] == "clock"
        assert any(message["type"] == "presence" for message in fast.received)
        assert "fast" in session.clients
        assert "slow" not in session.clients

    asyncio.run(run())

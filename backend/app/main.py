from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import Role, SessionCreateRequest
from .services.meso_data import load_meso_manifest, meso_payload
from .services.radar_data import CACHE_ROOT, load_radar_manifest, radar_payload
from .services.scenario_loader import (
    list_scenarios,
    load_event_config,
    load_scenario_by_id,
    load_scheduled_events,
)
from .state import ClientConnection, Participant, ScheduledItem, SessionState, manager

app = FastAPI(title="LIX SimOps API", version="0.8.0")
FRONTEND_DIST = CACHE_ROOT.parents[1] / "frontend" / "dist"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/scenarios")
def get_scenarios() -> list[dict[str, str]]:
    return [{"id": scenario.id, "name": scenario.name} for scenario in list_scenarios()]


@app.post("/api/sessions")
def create_session(request: SessionCreateRequest) -> dict:
    try:
        scenario = load_scenario_by_id(request.scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Scenario not found") from exc

    start = datetime.fromisoformat(scenario.simulation.start.replace("Z", "+00:00"))
    end = datetime.fromisoformat(scenario.simulation.end.replace("Z", "+00:00"))
    session = manager.create(
        scenario_id=scenario.id,
        scenario_name=scenario.name,
        scenario_start=start,
        scenario_end=end,
        default_speed=scenario.simulation.default_speed,
        timezone=scenario.timezone,
        scheduled_events=load_scheduled_events(scenario),
    )
    payload = session.session_snapshot()
    payload["facilitator_token"] = session.facilitator_token
    return payload


@app.get("/api/sessions/{session_code}")
def get_session(session_code: str) -> dict:
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.session_snapshot()



@app.get("/api/sessions/{session_code}/event")
def get_event_config(session_code: str) -> dict:
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    scenario = load_scenario_by_id(session.scenario_id)
    return load_event_config(scenario)


@app.get("/api/sessions/{session_code}/assets/{asset_path:path}")
def get_participant_asset(session_code: str, asset_path: str):
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    allowed = False
    radar_manifest = load_radar_manifest(session.scenario_id)
    if radar_manifest is not None:
        allowed = any(
            frame.asset == asset_path and frame.timestamp <= session.sim_time
            for frame in radar_manifest.frames
        )

    if not allowed:
        meso_manifest = load_meso_manifest(session.scenario_id)
        if meso_manifest is not None:
            allowed = any(
                frame.asset == asset_path and frame.timestamp <= session.sim_time
                for frame in meso_manifest.frames
            )

    if not allowed:
        raise HTTPException(status_code=404, detail="Asset not available at the current simulation time")

    scenario_root = (CACHE_ROOT / session.scenario_id).resolve()
    candidate = (scenario_root / asset_path).resolve()
    if not candidate.is_relative_to(scenario_root) or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(candidate)


@app.get("/api/sessions/{session_code}/radar/frames")
def get_radar_frames(
    session_code: str,
    product: str | None = None,
    elevation: float | None = None,
) -> dict:
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return radar_payload(session, product, elevation)


@app.get("/api/sessions/{session_code}/meso/frames")
def get_meso_frames(
    session_code: str,
    product: str | None = None,
) -> dict:
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return meso_payload(session, product)


def event_visible_to(event: dict, participant: Participant) -> bool:
    if participant.role == Role.FACILITATOR:
        return True

    event_type = event.get("type")
    if event_type == "inject":
        target_team_id = event.get("target_team_id")
        audience = event.get("audience", "all")
        if target_team_id and target_team_id not in {"*", participant.team_id}:
            return False
        return audience == "all" or audience == participant.role.value

    if event_type == "partner_message":
        target_team = event.get("team_id")
        return participant.role == Role.DSS and target_team in {"*", participant.team_id}

    if event_type in {"dss_response", "team_message"}:
        return event.get("team_id") == participant.team_id

    return True


async def send_to(
    session: SessionState,
    payload: dict,
    predicate=None,
) -> None:
    dead: list[str] = []
    async with session.send_lock:
        for participant_id, connection in list(session.clients.items()):
            if predicate and not predicate(connection.participant):
                continue
            try:
                await connection.websocket.send_json(payload)
            except Exception:
                dead.append(participant_id)

    for participant_id in dead:
        session.clients.pop(participant_id, None)


async def broadcast_clock(session: SessionState) -> None:
    await send_to(session, session.clock_snapshot())


async def broadcast_presence(session: SessionState) -> None:
    await send_to(session, session.presence_snapshot())


async def broadcast_schedule(session: SessionState) -> None:
    await send_to(
        session,
        session.schedule_snapshot(),
        lambda person: person.role == Role.FACILITATOR,
    )


async def send_error(websocket: WebSocket, message: str) -> None:
    await websocket.send_json({"type": "error", "message": message})


async def release_scheduled_item(session: SessionState, item: ScheduledItem) -> None:
    if item.status != "pending":
        return

    definition = item.definition
    item.status = "released"

    if definition.kind == "partner_message":
        payload = session.record(
            {
                "type": "partner_message",
                "event_id": uuid4().hex,
                "scheduled_id": definition.id,
                "scheduled": True,
                "scheduled_for": item.due_at.isoformat() if item.due_at else None,
                "team_id": definition.target_team_id or "*",
                "sender": definition.sender or "Event Command",
                "body": definition.body,
                "sim_time": session.sim_time.isoformat(),
            }
        )
    else:
        payload = session.record(
            {
                "type": "inject",
                "event_id": uuid4().hex,
                "scheduled_id": definition.id,
                "scheduled": True,
                "scheduled_for": item.due_at.isoformat() if item.due_at else None,
                "title": definition.title or "Exercise Inject",
                "body": definition.body,
                "audience": definition.audience,
                "target_team_id": definition.target_team_id,
                "sim_time": session.sim_time.isoformat(),
            }
        )

    await send_to(
        session,
        payload,
        lambda person: event_visible_to(payload, person),
    )
    await broadcast_schedule(session)


@app.websocket("/ws/{session_code}")
async def websocket_endpoint(websocket: WebSocket, session_code: str) -> None:
    session = manager.get(session_code)
    await websocket.accept()

    if session is None:
        await send_error(websocket, "Session not found")
        await websocket.close(code=4404)
        return

    display_name = (websocket.query_params.get("display_name") or "").strip()
    team_id = (websocket.query_params.get("team_id") or "").strip()
    raw_role = (websocket.query_params.get("role") or "").strip()

    try:
        role = Role(raw_role)
    except ValueError:
        await send_error(websocket, "Invalid role")
        await websocket.close(code=4400)
        return

    if not display_name:
        await send_error(websocket, "Display name is required")
        await websocket.close(code=4400)
        return

    if role == Role.FACILITATOR:
        facilitator_token = (websocket.query_params.get("facilitator_token") or "").strip()
        if not facilitator_token or not secrets.compare_digest(
            facilitator_token,
            session.facilitator_token,
        ):
            await send_error(websocket, "Invalid facilitator access key")
            await websocket.close(code=4403)
            return
        team_id = "FACILITATOR"
    elif not team_id:
        await send_error(websocket, "Team is required")
        await websocket.close(code=4400)
        return

    participant = Participant(
        id=uuid4().hex,
        display_name=display_name,
        team_id=team_id,
        role=role,
    )
    session.clients[participant.id] = ClientConnection(
        websocket=websocket,
        participant=participant,
    )

    await websocket.send_json(
        session.session_snapshot(include_schedule=role == Role.FACILITATOR)
    )
    history = [event for event in session.log if event_visible_to(event, participant)]
    await websocket.send_json({"type": "event_history", "events": history[-100:]})
    await broadcast_presence(session)

    try:
        while True:
            message = await websocket.receive_json()
            kind = message.get("type")

            if kind == "control":
                if role != Role.FACILITATOR:
                    await send_error(websocket, "Only facilitators can control the simulation")
                    continue

                action = message.get("action")
                if action == "start":
                    session.running = True
                elif action == "pause":
                    session.running = False
                elif action == "reset":
                    session.reset_clock()
                    await send_to(session, {"type": "event_history", "events": []})
                    await broadcast_schedule(session)
                elif action == "speed":
                    session.speed = max(0.25, min(float(message.get("speed", 1.0)), 8.0))
                else:
                    await send_error(websocket, "Unknown control action")
                    continue

                await broadcast_clock(session)

            elif kind == "scheduled_event_control":
                if role != Role.FACILITATOR:
                    await send_error(websocket, "Only facilitators can override the schedule")
                    continue

                item_id = str(message.get("item_id", "")).strip()
                action = str(message.get("action", "")).strip()
                item = session.scheduled_item(item_id)
                if item is None:
                    await send_error(websocket, "Scheduled event not found")
                    continue

                if action == "release_now":
                    if item.status == "skipped":
                        item.status = "pending"
                    await release_scheduled_item(session, item)
                elif action == "skip":
                    if item.status == "released":
                        await send_error(websocket, "Released events cannot be skipped")
                        continue
                    item.status = "skipped"
                    await broadcast_schedule(session)
                elif action == "restore":
                    if item.status == "released":
                        await send_error(websocket, "Released events cannot be restored")
                        continue
                    item.status = "pending"
                    await broadcast_schedule(session)
                else:
                    await send_error(websocket, "Unknown schedule override")
                    continue

            elif kind == "inject":
                if role != Role.FACILITATOR:
                    await send_error(websocket, "Only facilitators can release injects")
                    continue

                body = str(message.get("body", "")).strip()
                if not body:
                    await send_error(websocket, "Inject body is required")
                    continue

                payload = session.record(
                    {
                        "type": "inject",
                        "event_id": uuid4().hex,
                        "title": str(message.get("title", "Exercise inject")).strip()
                        or "Exercise inject",
                        "body": body,
                        "audience": message.get("audience", "all"),
                        "target_team_id": message.get("target_team_id"),
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await send_to(
                    session,
                    payload,
                    lambda person: event_visible_to(payload, person),
                )

            elif kind == "partner_message":
                if role != Role.FACILITATOR:
                    await send_error(websocket, "Only facilitators can send partner messages")
                    continue

                target_team = str(message.get("team_id", "")).strip()
                body = str(message.get("body", "")).strip()
                if not target_team or not body:
                    await send_error(websocket, "Partner message requires a team and message")
                    continue

                payload = session.record(
                    {
                        "type": "partner_message",
                        "event_id": uuid4().hex,
                        "team_id": target_team,
                        "sender": str(message.get("sender", "Event Command")).strip()
                        or "Event Command",
                        "body": body,
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await send_to(
                    session,
                    payload,
                    lambda person: event_visible_to(payload, person),
                )

            elif kind == "dss_response":
                if role != Role.DSS:
                    await send_error(websocket, "Only the DSS role can send partner responses")
                    continue

                body = str(message.get("body", "")).strip()
                if not body:
                    await send_error(websocket, "Response body is required")
                    continue

                payload = session.record(
                    {
                        "type": "dss_response",
                        "event_id": uuid4().hex,
                        "team_id": participant.team_id,
                        "sender": participant.display_name,
                        "body": body,
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await send_to(
                    session,
                    payload,
                    lambda person: person.role == Role.FACILITATOR
                    or person.team_id == participant.team_id,
                )

            elif kind == "team_message":
                if role == Role.FACILITATOR:
                    await send_error(websocket, "Facilitators should use injects or partner messages")
                    continue

                body = str(message.get("body", "")).strip()
                if not body:
                    continue

                payload = session.record(
                    {
                        "type": "team_message",
                        "event_id": uuid4().hex,
                        "team_id": participant.team_id,
                        "role": participant.role.value,
                        "sender": participant.display_name,
                        "body": body,
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await send_to(
                    session,
                    payload,
                    lambda person: person.role == Role.FACILITATOR
                    or person.team_id == participant.team_id,
                )

            else:
                await send_error(websocket, "Unknown message type")

    except WebSocketDisconnect:
        pass
    finally:
        session.clients.pop(participant.id, None)
        await broadcast_presence(session)


@app.on_event("startup")
async def start_clock_task() -> None:
    async def ticker() -> None:
        while True:
            await asyncio.sleep(1)
            for session in manager.all():
                if session.running and session.speed > 0:
                    next_time = session.sim_time + timedelta(seconds=session.speed)
                    reached_end = next_time >= session.scenario_end
                    session.sim_time = min(next_time, session.scenario_end)
                    for item in session.due_items():
                        await release_scheduled_item(session, item)
                    if reached_end:
                        session.running = False
                    if session.clients:
                        await broadcast_clock(session)

    asyncio.create_task(ticker())


# Portable/single-server mode: when GitHub Actions has built the React frontend,
# serve it from the same FastAPI process. API and WebSocket routes are declared
# above this catch-all mount, so they retain precedence.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

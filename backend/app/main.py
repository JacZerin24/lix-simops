from __future__ import annotations

import asyncio
import copy
import logging
import re
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import Role, SessionCreateRequest
from .services.meso_data import meso_asset_first_time, meso_payload
from .services.radar_data import CACHE_ROOT, radar_asset_first_time, radar_payload
from .services.route_warnings import route_centerline_from_config, warning_intersects_route
from .services.scenario_loader import (
    list_scenarios,
    load_event_config,
    load_initial_warnings,
    load_scenario_by_id,
    load_scheduled_events,
)
from .state import (
    ClientConnection,
    Participant,
    ScheduledItem,
    SessionState,
    WarningState,
    manager,
    resolve_schedule_time,
)

logger = logging.getLogger("simops.connections")
WS_SEND_TIMEOUT_SECONDS = 5.0

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
    session = manager.create(
        scenario_id=scenario.id,
        scenario_name=scenario.name,
        scenario_start=start,
        default_speed=scenario.simulation.default_speed,
        scheduled_events=load_scheduled_events(scenario),
        initial_warnings=load_initial_warnings(scenario),
    )
    return session.session_snapshot()


@app.get("/api/sessions/{session_code}")
def get_session(session_code: str) -> dict:
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.session_snapshot()


@app.get("/api/sessions/{session_code}/events")
def get_session_events(session_code: str) -> list[dict]:
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.log


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

    radar_time = radar_asset_first_time(session.scenario_id, asset_path)
    meso_time = meso_asset_first_time(session.scenario_id, asset_path)
    allowed = (
        (radar_time is not None and radar_time <= session.sim_time)
        or (meso_time is not None and meso_time <= session.sim_time)
    )

    if not allowed:
        raise HTTPException(
            status_code=404,
            detail="Asset not available at the current simulation time",
        )

    scenario_root = (CACHE_ROOT / session.scenario_id).resolve()
    candidate = (scenario_root / asset_path).resolve()
    if not candidate.is_relative_to(scenario_root) or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(
        candidate,
        headers={"Cache-Control": "private, max-age=3600, immutable"},
    )


@app.get("/api/sessions/{session_code}/radar/frames")
def get_radar_frames(
    session_code: str,
    product: str | None = None,
    elevation: float | None = None,
    scan_mode: str = "matched",
) -> dict:
    session = manager.get(session_code)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return radar_payload(session, product, elevation, scan_mode)


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
    if event_type in {"inject", "storm_report"}:
        target_team_id = event.get("target_team_id")
        audience = event.get("audience", "all")
        if target_team_id and target_team_id not in {"*", participant.team_id}:
            return False
        return audience == "all" or audience == participant.role.value

    if event_type == "partner_message":
        target_team = event.get("team_id")
        return participant.role == Role.DSS and target_team in {"*", participant.team_id}

    if event_type == "warning_route_notice":
        return (
            participant.role == Role.DSS
            and event.get("team_id") == participant.team_id
        )

    if event_type in {"dss_response", "team_message", "meso_update", "shift_log_update"}:
        return event.get("team_id") == participant.team_id

    if event_type == "warning_action":
        return (
            participant.role == Role.FACILITATOR
            or event.get("team_id") in {"*", participant.team_id}
        )

    return True


async def _send_connection(
    session: SessionState,
    participant_id: str,
    connection: ClientConnection,
    payload: dict,
) -> bool:
    """Never let a stalled/closed client block unrelated roles or teams."""
    try:
        async with connection.send_lock:
            await asyncio.wait_for(
                connection.websocket.send_json(payload),
                timeout=WS_SEND_TIMEOUT_SECONDS,
            )
        return True
    except Exception as exc:
        # A connection with this identity may already have reconnected.
        if session.clients.get(participant_id) is connection:
            session.clients.pop(participant_id, None)
        logger.warning(
            "WebSocket send failure session=%s team=%s role=%s event=%s error=%r",
            session.code,
            connection.participant.team_id,
            connection.participant.role.value,
            payload.get("type"),
            exc,
        )
        return False


async def send_to(session: SessionState, payload: dict, predicate=None) -> None:
    # Snapshot clients to tolerate joins/leaves while sending concurrently.
    recipients = [
        (participant_id, connection)
        for participant_id, connection in list(session.clients.items())
        if predicate is None or predicate(connection.participant)
    ]
    if not recipients:
        return
    delivered = await asyncio.gather(
        *[
            _send_connection(session, participant_id, connection, payload)
            for participant_id, connection in recipients
        ]
    )
    if not all(delivered) and payload.get("type") != "presence":
        await broadcast_presence(session)


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


async def broadcast_warnings(session: SessionState) -> None:
    # Prepare team-specific snapshots; never broadcast one team's warnings to another.
    recipients = list(session.clients.items())
    if not recipients:
        return
    delivered = await asyncio.gather(
        *[
            _send_connection(
                session,
                participant_id,
                connection,
                session.warning_snapshot(
                    None if connection.participant.role == Role.FACILITATOR
                    else connection.participant.team_id
                ),
            )
            for participant_id, connection in recipients
        ]
    )
    if not all(delivered):
        await broadcast_presence(session)


async def notify_dss_if_route_warned(
    session: SessionState,
    warning: WarningState,
    *,
    action: str = "issue",
) -> None:
    """Always inform the warning operator's own DSS of issued products.

    The approximate exercise centerline determines the route-impact label,
    never whether a DSS notification is delivered. A false negative from
    imperfect route geometry must not silently hide an issued warning.
    """
    scenario = load_scenario_by_id(session.scenario_id)
    route = route_centerline_from_config(load_event_config(scenario))
    intersects = bool(route and warning_intersects_route(warning.points, route))
    if action == "issue":
        title = (
            f"Possible route impact — {warning.label}"
            if intersects else f"New warning — {warning.label}"
        )
        geographic_context = (
            "The warning polygon intersects the exercise's approximate Endymion route "
            "centerline. "
            if intersects
            else "The exercise's approximate route centerline did not intersect "
            "this warning polygon. Verify the actual route, staging areas and "
            "warning polygon before assessing impacts. "
        )
        body = (
            f"EXERCISE: {warning.label} issued by {warning.issuer}. "
            + geographic_context
            + f"Warning valid until {warning.expires_at.astimezone(ZoneInfo('America/Chicago')):%I:%M %p %Z}. "
            "Review the issued product and provide Event Command with relevant "
            "weather hazards, affected areas, timing and confidence. "
            "Unified Command retains all operational decisions."
        )
    else:
        # SVS changes to the warning must reach DSS even if the updated or
        # original polygon lies outside the exercise centerline.
        labels = {
            "COR": "corrected",
            "CON": "continued/updated",
            "CAN": "cancelled",
            "EXP": "expired",
        }
        title = f"Warning follow-up — {action}"
        body = (
            f"EXERCISE: {warning.label} {labels.get(action, action)} "
            f"by {warning.issuer}'s team. "
            + (
                "The current warning polygon intersects the exercise's approximate "
                "route centerline. "
                if intersects
                else "The approximate centerline check does not currently show "
                "route overlap; verify route/staging impacts independently. "
            )
            + "Review the latest SVS text and polygon. DSS communicates the "
            "weather implications; Unified Command retains operational decisions."
        )

    payload = session.record({
        "type": "warning_route_notice",
        "event_id": uuid4().hex,
        "team_id": warning.team_id,
        "warning_id": warning.id,
        "warning_text": (
            warning.text if action == "issue"
            else warning.followups[-1].get("text", "") if warning.followups else ""
        ),
        "hazard": warning.hazard,
        "route_intersects": intersects,
        "action": action,
        "title": title,
        "sender": "Radar Warning Desk",
        "body": body,
        "sim_time": session.sim_time.isoformat(),
    })
    await send_to(session, payload, lambda person: event_visible_to(payload, person))


def normalize_warning_points(raw_points) -> list[dict[str, float]]:
    if not isinstance(raw_points, list):
        raise ValueError("Warning polygon must be a list of points")
    points: list[dict[str, float]] = []
    for point in raw_points:
        if not isinstance(point, dict) or "lat" not in point or "lon" not in point:
            raise ValueError("Each warning point requires lat and lon")
        lat = float(point["lat"])
        lon = float(point["lon"])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("Warning polygon contains an invalid coordinate")
        points.append({"lat": lat, "lon": lon})
    if len(points) < 3:
        raise ValueError("Warning polygon requires at least three vertices")
    return points


def point_in_warning_polygon(
    point: dict[str, float],
    polygon: list[dict[str, float]],
) -> bool:
    x = point["lon"]
    y = point["lat"]
    inside = False
    tolerance = 1e-9

    for index, first in enumerate(polygon):
        second = polygon[(index + 1) % len(polygon)]
        x1, y1 = first["lon"], first["lat"]
        x2, y2 = second["lon"], second["lat"]

        dx = x2 - x1
        dy = y2 - y1
        cross = (x - x1) * dy - (y - y1) * dx
        if abs(cross) <= tolerance:
            dot = (x - x1) * dx + (y - y1) * dy
            length_squared = dx * dx + dy * dy
            if -tolerance <= dot <= length_squared + tolerance:
                return True

        if (y1 > y) != (y2 > y):
            intersection_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection_x:
                inside = not inside

    return inside


def polygon_within_warning(
    candidate: list[dict[str, float]],
    current: list[dict[str, float]],
) -> bool:
    if len(candidate) < 3 or len(current) < 3:
        return False

    # Sample each candidate edge densely enough to reject operationally
    # meaningful expansion across a concave warning boundary without adding a
    # heavyweight GIS dependency to the portable backend.
    samples_per_edge = 24
    for index, first in enumerate(candidate):
        second = candidate[(index + 1) % len(candidate)]
        for sample in range(samples_per_edge + 1):
            fraction = sample / samples_per_edge
            point = {
                "lat": first["lat"] + (second["lat"] - first["lat"]) * fraction,
                "lon": first["lon"] + (second["lon"] - first["lon"]) * fraction,
            }
            if not point_in_warning_polygon(point, current):
                return False
    return True


async def expire_due_warnings(session: SessionState) -> None:
    changed = False
    for warning in session.warnings:
        if warning.status == "active" and warning.expires_at <= session.sim_time:
            warning.status = "expired"
            session.record(
                {
                    "type": "warning_action",
                    "event_id": uuid4().hex,
                    "action": "expire",
                    "warning_id": warning.id,
                    "hazard": warning.hazard,
                    "team_id": warning.team_id,
                    "issuer": warning.issuer,
                    "sim_time": session.sim_time.isoformat(),
                }
            )
            changed = True
    if changed:
        await broadcast_warnings(session)


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
    elif definition.kind == "storm_report":
        observed_at = (
            resolve_schedule_time(
                definition.observed_at_sim_time,
                session.scenario_start,
            )
            if definition.observed_at_sim_time
            else session.sim_time
        )
        payload = session.record(
            {
                "type": "storm_report",
                "event_id": uuid4().hex,
                "scheduled_id": definition.id,
                "scheduled": True,
                "scheduled_for": item.due_at.isoformat() if item.due_at else None,
                "title": definition.title or "Storm Report",
                "body": definition.body,
                "audience": definition.audience,
                "target_team_id": definition.target_team_id,
                "report_kind": definition.report_kind,
                "lat": definition.lat,
                "lon": definition.lon,
                "magnitude": definition.magnitude,
                "source": definition.source or definition.sender or "Report",
                "observed_at": observed_at.isoformat() if observed_at else session.sim_time.isoformat(),
                "plot_on_radar": definition.plot_on_radar,
                "expires_at": (
                    session.sim_time + timedelta(minutes=definition.display_minutes)
                ).isoformat(),
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
        team_id = "FACILITATOR"
    elif not team_id:
        await send_error(websocket, "Team is required")
        await websocket.close(code=4400)
        return

    # Client-generated ID is stable across automatic reconnects from one tab.
    # Restrict its syntax so malformed client input cannot enter the roster.
    requested_id = (websocket.query_params.get("client_id") or "").strip()
    participant_id = (
        requested_id if re.fullmatch(r"[A-Za-z0-9-]{16,80}", requested_id)
        else uuid4().hex
    )
    participant = Participant(
        id=participant_id,
        display_name=display_name,
        team_id=team_id,
        role=role,
    )
    connection = ClientConnection(websocket=websocket, participant=participant)
    try:
        # Complete the initial handshake before registering this socket for
        # clock/presence broadcasts. No concurrent sends during initialization.
        if role != Role.FACILITATOR:
            session.ensure_team_warnings(participant.team_id)
        async with connection.send_lock:
            await websocket.send_json(
                session.session_snapshot(include_schedule=role == Role.FACILITATOR)
            )
            history = [
                event
                for event in session.log
                if event.get("type") != "warning_action"
                and event_visible_to(event, participant)
            ]
            await websocket.send_json(
                {
                    "type": "event_history",
                    "events": history if role == Role.FACILITATOR else history[-100:],
                }
            )
            team_scope = None if role == Role.FACILITATOR else participant.team_id
            await websocket.send_json(session.warning_snapshot(team_scope))

        previous = session.clients.get(participant.id)
        session.clients[participant.id] = connection
        if previous is not None and previous is not connection:
            logger.info(
                "WebSocket superseded session=%s team=%s role=%s",
                session.code, participant.team_id, participant.role.value,
            )
            try:
                await asyncio.wait_for(
                    previous.websocket.close(code=4001, reason="Connection superseded"),
                    timeout=2.0,
                )
            except Exception as exc:
                logger.debug("Previous connection already closed: %r", exc)
        logger.info(
            "WebSocket joined session=%s team=%s role=%s clients=%d",
            session.code, participant.team_id, participant.role.value, len(session.clients),
        )
        if role != Role.FACILITATOR:
            await send_to(
                session,
                session.warning_snapshot(None),
                lambda person: person.role == Role.FACILITATOR,
            )
        await broadcast_presence(session)

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
                    await broadcast_warnings(session)
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

            elif kind == "storm_report":
                if role != Role.FACILITATOR:
                    await send_error(websocket, "Only facilitators can release storm reports")
                    continue

                try:
                    lat = float(message.get("lat"))
                    lon = float(message.get("lon"))
                    display_minutes = int(message.get("display_minutes", 60))
                except (TypeError, ValueError):
                    await send_error(websocket, "Storm report requires valid lat/lon and display duration")
                    continue

                report_kind = str(message.get("report_kind", "report")).lower()
                if report_kind not in {"tornado", "hail", "wind", "report"}:
                    await send_error(websocket, "Storm report type must be tornado, hail, wind, or report")
                    continue
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    await send_error(websocket, "Storm report lat/lon are out of range")
                    continue
                if not 1 <= display_minutes <= 240:
                    await send_error(websocket, "Storm report display duration must be 1-240 minutes")
                    continue

                body = str(message.get("body", "")).strip()
                title = str(message.get("title", "Storm Report")).strip() or "Storm Report"
                source = str(message.get("source", "Exercise report")).strip() or "Exercise report"
                payload = session.record(
                    {
                        "type": "storm_report",
                        "event_id": uuid4().hex,
                        "scheduled": False,
                        "title": title,
                        "body": body,
                        "audience": message.get("audience", "radar"),
                        "target_team_id": message.get("target_team_id"),
                        "report_kind": report_kind,
                        "lat": lat,
                        "lon": lon,
                        "magnitude": str(message.get("magnitude", "")).strip() or None,
                        "source": source,
                        "observed_at": session.sim_time.isoformat(),
                        "plot_on_radar": bool(message.get("plot_on_radar", True)),
                        "expires_at": (
                            session.sim_time + timedelta(minutes=display_minutes)
                        ).isoformat(),
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await send_to(
                    session,
                    payload,
                    lambda person: event_visible_to(payload, person),
                )

            elif kind == "warning_issue":
                if role != Role.RADAR:
                    await send_error(websocket, "Only the Radar Operator can issue warnings")
                    continue

                hazard = str(message.get("hazard", "")).upper()
                if hazard not in {"TOR", "SVR"}:
                    await send_error(websocket, "Warning type must be TOR or SVR")
                    continue

                try:
                    points = normalize_warning_points(message.get("points"))
                    duration_minutes = int(message.get("duration_minutes", 30))
                except (TypeError, ValueError) as exc:
                    await send_error(websocket, str(exc))
                    continue

                valid_durations = (
                    {15, 20, 25, 30, 40, 45, 50, 60}
                    if hazard == "TOR"
                    else {15, 20, 25, 30, 40, 45, 50, 60, 75, 90}
                )
                if duration_minutes not in valid_durations:
                    await send_error(
                        websocket,
                        "Warning duration is not valid for the selected WarnGen product",
                    )
                    continue

                warning_text = str(message.get("text", "")).strip()
                attributes = (
                    message.get("attributes")
                    if isinstance(message.get("attributes"), dict)
                    else {}
                )
                if not warning_text:
                    await send_error(
                        websocket,
                        "Use WarnGen Create Text and review the product before issuing",
                    )
                    continue
                if attributes.get("track_type") not in {"one_storm", "line_of_storms"}:
                    await send_error(
                        websocket,
                        "WarnGen storm-track metadata is required before issuing",
                    )
                    continue

                warning = WarningState(
                    id=uuid4().hex,
                    hazard=hazard,
                    label="Tornado Warning" if hazard == "TOR" else "Severe Thunderstorm Warning",
                    team_id=participant.team_id,
                    points=points,
                    initial_points=copy.deepcopy(points),
                    issued_at=session.sim_time,
                    expires_at=session.sim_time + timedelta(minutes=duration_minutes),
                    issuer=participant.display_name,
                    text=warning_text,
                    attributes=attributes,
                )
                session.warnings.append(warning)
                session.record(
                    {
                        "type": "warning_action",
                        "event_id": uuid4().hex,
                        "action": "issue",
                        "warning_id": warning.id,
                        "hazard": warning.hazard,
                        "team_id": warning.team_id,
                        "issuer": warning.issuer,
                        "points": warning.points,
                        "expires_at": warning.expires_at.isoformat(),
                        "attributes": warning.attributes,
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await broadcast_warnings(session)
                await notify_dss_if_route_warned(session, warning)

            elif kind == "warning_followup":
                if role != Role.RADAR:
                    await send_error(websocket, "Only the Radar Operator can issue warning follow-ups")
                    continue

                warning_id = str(message.get("warning_id", "")).strip()
                warning = session.warning_by_id(warning_id)
                if warning is None or warning.team_id != participant.team_id:
                    await send_error(websocket, "Warning not found for this team")
                    continue
                action = str(message.get("action", "")).upper()
                if action not in {"COR", "CON", "CAN", "EXP"}:
                    await send_error(websocket, "SVS action must be COR, CON, CAN, or EXP")
                    continue

                if action in {"COR", "CON", "CAN"} and warning.status != "active":
                    await send_error(websocket, "This follow-up requires an active warning")
                    continue
                if action == "EXP" and warning.status not in {"active", "expired"}:
                    await send_error(websocket, "EXP can only follow an active or expired warning")
                    continue

                followup_text = str(message.get("text", "")).strip()
                if not followup_text:
                    await send_error(
                        websocket,
                        "Use SVS Create Text and review the product before issuing",
                    )
                    continue

                attributes = (
                    message.get("attributes")
                    if isinstance(message.get("attributes"), dict)
                    else {}
                )
                followup_points = copy.deepcopy(warning.points)

                if action == "CON" and message.get("points") is not None:
                    try:
                        candidate_points = normalize_warning_points(message.get("points"))
                    except (TypeError, ValueError) as exc:
                        await send_error(websocket, str(exc))
                        continue
                    if not polygon_within_warning(candidate_points, warning.points):
                        await send_error(
                            websocket,
                            "A CON follow-up may trim the warned area but cannot expand it",
                        )
                        continue
                    followup_points = candidate_points
                    warning.points = copy.deepcopy(candidate_points)

                followup = {
                    "id": uuid4().hex,
                    "action": action,
                    "issued_at": session.sim_time.isoformat(),
                    "issuer": participant.display_name,
                    "text": followup_text,
                    "attributes": attributes,
                    "points": copy.deepcopy(followup_points),
                }
                warning.followups.append(followup)

                if action == "CAN":
                    warning.status = "cancelled"
                elif action == "EXP":
                    warning.status = "expired"

                session.record(
                    {
                        "type": "warning_action",
                        "event_id": uuid4().hex,
                        "action": "followup",
                        "vtec_action": action,
                        "warning_id": warning.id,
                        "hazard": warning.hazard,
                        "team_id": warning.team_id,
                        "issuer": participant.display_name,
                        "points": copy.deepcopy(followup_points),
                        "attributes": attributes,
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await broadcast_warnings(session)
                await notify_dss_if_route_warned(session, warning, action=action)

            elif kind == "warning_update":
                await send_error(
                    websocket,
                    "Use an SVS CON/COR follow-up instead of directly updating a warning",
                )

            elif kind == "warning_cancel":
                await send_error(
                    websocket,
                    "Use an SVS CAN follow-up instead of directly cancelling a warning",
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

            elif kind == "shift_log_update":
                if role != Role.DSS:
                    await send_error(websocket, "Only the DSS role can mark shift log updates")
                    continue

                payload = session.record(
                    {
                        "type": "shift_log_update",
                        "event_id": uuid4().hex,
                        "team_id": participant.team_id,
                        "role": participant.role.value,
                        "sender": participant.display_name,
                        "body": "Shift log entry submitted.",
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await send_to(
                    session,
                    payload,
                    lambda person: event_visible_to(payload, person),
                )

            elif kind == "meso_update":
                if role != Role.MESO:
                    await send_error(websocket, "Only the Mesoanalyst role can send meso updates")
                    continue

                body = str(message.get("body", "")).strip()
                if not body:
                    await send_error(websocket, "Meso update body is required")
                    continue

                payload = session.record(
                    {
                        "type": "meso_update",
                        "event_id": uuid4().hex,
                        "team_id": participant.team_id,
                        "role": participant.role.value,
                        "sender": participant.display_name,
                        "body": body,
                        "category": str(message.get("category", "")).strip(),
                        "product_id": str(message.get("product_id", "")).strip(),
                        "product_label": str(message.get("product_label", "")).strip(),
                        "frame_time": str(message.get("frame_time", "")).strip(),
                        "sim_time": session.sim_time.isoformat(),
                    }
                )
                await send_to(
                    session,
                    payload,
                    lambda person: event_visible_to(payload, person),
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

    except WebSocketDisconnect as exc:
        logger.info(
            "WebSocket disconnected session=%s team=%s role=%s code=%s",
            session.code, participant.team_id, participant.role.value, exc.code,
        )
    except Exception:
        logger.exception(
            "WebSocket handler failed session=%s team=%s role=%s",
            session.code, participant.team_id, participant.role.value,
        )
    finally:
        # A newer reconnect may already own this ID; never delete it.
        if session.clients.get(participant.id) is connection:
            session.clients.pop(participant.id, None)
            await broadcast_presence(session)
        logger.info(
            "WebSocket handler exited session=%s team=%s role=%s clients=%d",
            session.code, participant.team_id, participant.role.value, len(session.clients),
        )


@app.on_event("startup")
async def start_clock_task() -> None:
    async def ticker() -> None:
        while True:
            await asyncio.sleep(1)
            for session in manager.all():
                if session.running and session.speed > 0:
                    session.sim_time += timedelta(seconds=session.speed)
                    for item in session.due_items():
                        await release_scheduled_item(session, item)
                    await expire_due_warnings(session)
                    if session.clients:
                        await broadcast_clock(session)

    asyncio.create_task(ticker())


# Portable/single-server mode: serve the prebuilt React app from FastAPI.
# API and WebSocket routes above retain precedence over this catch-all mount.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

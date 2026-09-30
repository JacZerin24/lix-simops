from __future__ import annotations

import asyncio
import copy
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from simulator.scenarios.schema import ScheduledExerciseEvent

from .models import Role


@dataclass
class Participant:
    id: str
    display_name: str
    team_id: str
    role: Role

    def snapshot(self) -> dict[str, str]:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "team_id": self.team_id,
            "role": self.role.value,
        }


@dataclass
class ClientConnection:
    websocket: Any
    participant: Participant


@dataclass
class ScheduledItem:
    definition: ScheduledExerciseEvent
    due_at: datetime | None
    status: str = "pending"

    def snapshot(self) -> dict[str, Any]:
        return {
            **self.definition.model_dump(),
            "due_at": self.due_at.isoformat() if self.due_at else None,
            "status": self.status,
        }


@dataclass
class WarningState:
    id: str
    hazard: str
    label: str
    team_id: str
    points: list[dict[str, float]]
    issued_at: datetime
    expires_at: datetime
    issuer: str
    status: str = "active"
    inherited: bool = False
    text: str = ""
    attributes: dict[str, Any] = field(default_factory=dict)
    followups: list[dict[str, Any]] = field(default_factory=list)

    def snapshot(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "hazard": self.hazard,
            "label": self.label,
            "team_id": self.team_id,
            "points": copy.deepcopy(self.points),
            "issued_at": self.issued_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "issuer": self.issuer,
            "status": self.status,
            "inherited": self.inherited,
            "text": self.text,
            "attributes": copy.deepcopy(self.attributes),
            "followups": copy.deepcopy(self.followups),
        }


def warning_from_definition(
    definition: dict[str, Any],
    *,
    scenario_start: datetime,
) -> WarningState:
    hazard = str(definition.get("hazard", "SVR")).upper()
    label = str(definition.get("label") or ("Tornado Warning" if hazard == "TOR" else "Severe Thunderstorm Warning"))
    issued_at_raw = definition.get("issued_at")
    expires_at_raw = definition.get("expires_at")
    issued_at = (
        datetime.fromisoformat(str(issued_at_raw).replace("Z", "+00:00"))
        if issued_at_raw
        else scenario_start
    )
    expires_at = (
        datetime.fromisoformat(str(expires_at_raw).replace("Z", "+00:00"))
        if expires_at_raw
        else scenario_start + timedelta(minutes=30)
    )
    points = [
        {"lat": float(point["lat"]), "lon": float(point["lon"])}
        for point in definition.get("points", [])
        if "lat" in point and "lon" in point
    ]
    if hazard not in {"TOR", "SVR"}:
        raise ValueError("Inherited warning type must be TOR or SVR")
    if len(points) < 3:
        raise ValueError("Inherited warning polygon requires at least three vertices")
    if issued_at > scenario_start or expires_at <= scenario_start:
        raise ValueError(
            "Inherited warnings must be issued before or at T=0 and remain valid after T=0"
        )
    return WarningState(
        id=str(definition.get("id") or f"inherited-{hazard.lower()}"),
        hazard=hazard,
        label=label,
        team_id=str(definition.get("team_id") or "*"),
        points=points,
        issued_at=issued_at,
        expires_at=expires_at,
        issuer=str(definition.get("issuer") or "Inherited warning"),
        status="active",
        inherited=True,
        text=str(definition.get("text") or ""),
        attributes=copy.deepcopy(definition.get("attributes") or {}),
        followups=copy.deepcopy(definition.get("followups") or []),
    )


def resolve_schedule_time(spec: str, scenario_start: datetime) -> datetime | None:
    value = spec.strip()
    if value.lower() == "manual":
        return None
    if value.startswith("T+"):
        hours, minutes, seconds = (int(part) for part in value[2:].split(":"))
        return scenario_start + timedelta(hours=hours, minutes=minutes, seconds=seconds)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass
class SessionState:
    code: str
    scenario_id: str
    scenario_name: str
    scenario_start: datetime
    sim_time: datetime
    running: bool = False
    speed: float = 1.0
    default_speed: float = 1.0
    clients: dict[str, ClientConnection] = field(default_factory=dict)
    log: list[dict[str, Any]] = field(default_factory=list)
    schedule: list[ScheduledItem] = field(default_factory=list)
    initial_warnings: list[WarningState] = field(default_factory=list)
    warnings: list[WarningState] = field(default_factory=list)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def clock_snapshot(self) -> dict[str, Any]:
        return {
            "type": "clock",
            "session_code": self.code,
            "sim_time": self.sim_time.isoformat(),
            "running": self.running,
            "speed": self.speed,
        }

    def presence_snapshot(self) -> dict[str, Any]:
        return {
            "type": "presence",
            "participants": [
                connection.participant.snapshot()
                for connection in self.clients.values()
            ],
        }

    def schedule_snapshot(self) -> dict[str, Any]:
        return {
            "type": "schedule",
            "items": [item.snapshot() for item in self.schedule],
        }


    def warning_snapshot(self, team_id: str | None = None) -> dict[str, Any]:
        visible = [
            warning.snapshot()
            for warning in self.warnings
            if team_id is None
            or warning.team_id == "*"
            or warning.team_id == team_id
        ]
        return {"type": "warning_state", "warnings": visible}

    def warning_by_id(self, warning_id: str) -> WarningState | None:
        return next((warning for warning in self.warnings if warning.id == warning_id), None)

    def session_snapshot(self, *, include_schedule: bool = False) -> dict[str, Any]:
        payload = {
            "type": "session_state",
            "session_code": self.code,
            "scenario_id": self.scenario_id,
            "scenario_name": self.scenario_name,
            "sim_time": self.sim_time.isoformat(),
            "running": self.running,
            "speed": self.speed,
            "participants": [
                connection.participant.snapshot()
                for connection in self.clients.values()
            ],
        }
        if include_schedule:
            payload["schedule"] = [item.snapshot() for item in self.schedule]
        return payload

    def reset_clock(self) -> None:
        self.sim_time = self.scenario_start
        self.running = False
        self.speed = self.default_speed
        self.log.clear()
        self.warnings = copy.deepcopy(self.initial_warnings)
        for item in self.schedule:
            item.status = "pending"

    def record(self, event: dict[str, Any]) -> dict[str, Any]:
        self.log.append(event)
        return event

    def scheduled_item(self, item_id: str) -> ScheduledItem | None:
        return next(
            (item for item in self.schedule if item.definition.id == item_id),
            None,
        )

    def due_items(self) -> list[ScheduledItem]:
        return [
            item
            for item in self.schedule
            if item.status == "pending"
            and item.due_at is not None
            and item.due_at <= self.sim_time
        ]


class SessionManager:
    def __init__(self) -> None:
        self.sessions: dict[str, SessionState] = {}

    def create(
        self,
        *,
        scenario_id: str,
        scenario_name: str,
        scenario_start: datetime,
        default_speed: float,
        scheduled_events: list[ScheduledExerciseEvent] | None = None,
        initial_warnings: list[dict[str, Any]] | None = None,
    ) -> SessionState:
        code = self._new_code()
        schedule = [
            ScheduledItem(
                definition=definition,
                due_at=resolve_schedule_time(definition.at_sim_time, scenario_start),
            )
            for definition in (scheduled_events or [])
        ]
        warning_seed = [
            warning_from_definition(definition, scenario_start=scenario_start)
            for definition in (initial_warnings or [])
        ]
        state = SessionState(
            code=code,
            scenario_id=scenario_id,
            scenario_name=scenario_name,
            scenario_start=scenario_start,
            sim_time=scenario_start,
            speed=default_speed,
            default_speed=default_speed,
            schedule=schedule,
            initial_warnings=copy.deepcopy(warning_seed),
            warnings=copy.deepcopy(warning_seed),
        )
        self.sessions[code] = state
        return state

    def get(self, code: str) -> SessionState | None:
        return self.sessions.get(code.strip().upper())

    def all(self) -> list[SessionState]:
        return list(self.sessions.values())

    def _new_code(self) -> str:
        alphabet = string.ascii_uppercase + string.digits
        while True:
            code = "".join(secrets.choice(alphabet) for _ in range(6))
            if code not in self.sessions:
                return code


manager = SessionManager()

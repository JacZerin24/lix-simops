from __future__ import annotations

import asyncio
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
    scenario_end: datetime
    sim_time: datetime
    facilitator_token: str
    timezone: str = "America/Chicago"
    running: bool = False
    speed: float = 1.0
    default_speed: float = 1.0
    clients: dict[str, ClientConnection] = field(default_factory=dict)
    log: list[dict[str, Any]] = field(default_factory=list)
    schedule: list[ScheduledItem] = field(default_factory=list)
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

    def session_snapshot(self, *, include_schedule: bool = False) -> dict[str, Any]:
        payload = {
            "type": "session_state",
            "session_code": self.code,
            "scenario_id": self.scenario_id,
            "scenario_name": self.scenario_name,
            "timezone": self.timezone,
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
        scenario_end: datetime,
        default_speed: float,
        timezone: str = "America/Chicago",
        scheduled_events: list[ScheduledExerciseEvent] | None = None,
    ) -> SessionState:
        code = self._new_code()
        schedule = [
            ScheduledItem(
                definition=definition,
                due_at=resolve_schedule_time(definition.at_sim_time, scenario_start),
            )
            for definition in (scheduled_events or [])
        ]
        state = SessionState(
            code=code,
            scenario_id=scenario_id,
            scenario_name=scenario_name,
            scenario_start=scenario_start,
            scenario_end=scenario_end,
            sim_time=scenario_start,
            facilitator_token=secrets.token_urlsafe(18),
            timezone=timezone,
            speed=default_speed,
            default_speed=default_speed,
            schedule=schedule,
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

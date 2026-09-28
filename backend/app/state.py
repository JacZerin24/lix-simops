from __future__ import annotations

import asyncio
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

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
class SessionState:
    code: str
    scenario_id: str
    scenario_name: str
    scenario_start: datetime
    sim_time: datetime
    running: bool = False
    speed: float = 1.0
    clients: dict[str, ClientConnection] = field(default_factory=dict)
    log: list[dict[str, Any]] = field(default_factory=list)
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

    def session_snapshot(self) -> dict[str, Any]:
        return {
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

    def reset_clock(self) -> None:
        self.sim_time = self.scenario_start
        self.running = False
        self.speed = 1.0

    def record(self, event: dict[str, Any]) -> dict[str, Any]:
        self.log.append(event)
        return event


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
    ) -> SessionState:
        code = self._new_code()
        state = SessionState(
            code=code,
            scenario_id=scenario_id,
            scenario_name=scenario_name,
            scenario_start=scenario_start,
            sim_time=scenario_start,
            speed=default_speed,
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

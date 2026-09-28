from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class SessionState:
    code: str = "DEMO"
    sim_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    running: bool = False
    speed: float = 1.0
    clients: set[Any] = field(default_factory=set)
    log: list[dict[str, Any]] = field(default_factory=list)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def snapshot(self) -> dict[str, Any]:
        return {
            "type": "clock",
            "session_code": self.code,
            "sim_time": self.sim_time.isoformat(),
            "running": self.running,
            "speed": self.speed,
        }


session = SessionState()

from dataclasses import dataclass, field
from typing import Any


@dataclass
class InMemoryEventLog:
    events: list[dict[str, Any]] = field(default_factory=list)

    def append(self, item: dict[str, Any]) -> None:
        self.events.append(item)

    def all(self) -> list[dict[str, Any]]:
        return list(self.events)

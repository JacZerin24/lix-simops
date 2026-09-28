from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class NexradVolume:
    site: str
    timestamp: str
    path: Path


class NexradProvider:
    """Interface for time-gated archived NEXRAD data."""

    def available_at(self, sim_time: str) -> list[NexradVolume]:
        # V0.3: return only volumes whose timestamps are <= simulation time.
        return []

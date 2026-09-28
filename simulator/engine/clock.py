from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass
class SimulationClock:
    current: datetime
    running: bool = False
    speed: float = 1.0

    def advance(self, real_seconds: float) -> datetime:
        if self.running:
            self.current += timedelta(seconds=real_seconds * self.speed)
        return self.current

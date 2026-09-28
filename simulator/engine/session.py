from dataclasses import dataclass, field

from .clock import SimulationClock


@dataclass
class Participant:
    name: str
    team_id: str
    role: str


@dataclass
class ExerciseSession:
    code: str
    clock: SimulationClock
    participants: list[Participant] = field(default_factory=list)

    def join(self, participant: Participant) -> None:
        self.participants.append(participant)

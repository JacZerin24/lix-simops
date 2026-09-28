from dataclasses import dataclass


@dataclass(frozen=True)
class Inject:
    id: str
    at_sim_time: str
    title: str
    body: str
    audience: str = "all"

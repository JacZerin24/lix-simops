from typing import Literal

from pydantic import BaseModel, Field


class SimulationConfig(BaseModel):
    start: str
    end: str
    default_speed: float = Field(default=1.0, gt=0, le=8)


class DatasetConfig(BaseModel):
    nexrad: bool = True
    goes: bool = True
    glm: bool = True
    lightningcast: bool = False
    mrms: bool = False
    observations: bool = True


class ScheduledExerciseEvent(BaseModel):
    id: str
    at_sim_time: str
    kind: Literal["inject", "partner_message"] = "inject"
    title: str = "Exercise Inject"
    body: str
    audience: str = "all"
    target_team_id: str | None = None
    sender: str = "Event Command"


class ScenarioConfig(BaseModel):
    id: str
    name: str
    timezone: str = "America/Chicago"
    simulation: SimulationConfig
    datasets: DatasetConfig
    roles: list[str]
    event_file: str = "event.yaml"
    injects_file: str = "injects.yaml"
    resources_file: str = "resources.yaml"

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


class ScenarioConfig(BaseModel):
    id: str
    name: str
    timezone: str = "America/Chicago"
    simulation: SimulationConfig
    datasets: DatasetConfig
    roles: list[str]

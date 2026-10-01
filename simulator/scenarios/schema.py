from typing import Literal

from pydantic import BaseModel, Field, model_validator


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
    kind: Literal["inject", "partner_message", "storm_report"] = "inject"
    title: str = "Exercise Inject"
    body: str
    audience: str = "all"
    target_team_id: str | None = None
    sender: str = "Event Command"

    # Optional geolocated storm-report metadata. These fields are ignored for
    # ordinary injects/partner messages.
    report_kind: Literal["tornado", "hail", "wind", "report"] | None = None
    lat: float | None = None
    lon: float | None = None
    magnitude: str | None = None
    source: str | None = None
    observed_at_sim_time: str | None = None
    plot_on_radar: bool = True
    display_minutes: int = Field(default=60, ge=1, le=240)

    @model_validator(mode="after")
    def validate_storm_report(self):
        if self.kind == "storm_report":
            if self.report_kind is None:
                raise ValueError("storm_report requires report_kind")
            if self.lat is None or self.lon is None:
                raise ValueError("storm_report requires lat and lon")
            if not -90 <= self.lat <= 90 or not -180 <= self.lon <= 180:
                raise ValueError("storm_report lat/lon are out of range")
        return self


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
    initial_warnings_file: str = "initial-warnings.yaml"
    source_case_file: str | None = None

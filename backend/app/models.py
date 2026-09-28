from enum import StrEnum

from pydantic import BaseModel, Field


class Role(StrEnum):
    RADAR = "radar"
    MESO = "mesoanalyst"
    DSS = "dss"
    FACILITATOR = "facilitator"


class ClockState(BaseModel):
    sim_time: str
    running: bool = False
    speed: float = Field(default=1.0, ge=0.0, le=8.0)


class JoinRequest(BaseModel):
    session_code: str
    team_id: str
    display_name: str
    role: Role


class ControlAction(BaseModel):
    action: str
    speed: float | None = None


class InjectMessage(BaseModel):
    inject_id: str
    title: str
    body: str
    audience: str = "all"

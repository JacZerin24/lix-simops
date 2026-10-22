from pathlib import Path

import yaml

from simulator.scenarios.schema import ScenarioConfig, ScheduledExerciseEvent


SCENARIOS_ROOT = Path(__file__).resolve().parents[3] / "scenarios"


def load_scenario(path: str | Path) -> ScenarioConfig:
    scenario_path = Path(path)
    with scenario_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    return ScenarioConfig.model_validate(raw)


def list_scenarios() -> list[ScenarioConfig]:
    scenarios: list[ScenarioConfig] = []
    for path in sorted(SCENARIOS_ROOT.glob("*/scenario.yaml")):
        scenarios.append(load_scenario(path))
    return scenarios


def scenario_directory_by_id(scenario_id: str) -> Path:
    for path in sorted(SCENARIOS_ROOT.glob("*/scenario.yaml")):
        scenario = load_scenario(path)
        if scenario.id == scenario_id:
            return path.parent
    raise KeyError(scenario_id)


def load_scenario_by_id(scenario_id: str) -> ScenarioConfig:
    directory = scenario_directory_by_id(scenario_id)
    return load_scenario(directory / "scenario.yaml")


def load_scheduled_events(scenario: ScenarioConfig) -> list[ScheduledExerciseEvent]:
    directory = scenario_directory_by_id(scenario.id)
    path = directory / scenario.injects_file
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    return [
        ScheduledExerciseEvent.model_validate(item)
        for item in raw.get("injects", [])
    ]


def load_event_config(scenario: ScenarioConfig) -> dict:
    directory = scenario_directory_by_id(scenario.id)
    path = directory / scenario.event_file
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def load_initial_warnings(scenario: ScenarioConfig) -> list[dict]:
    directory = scenario_directory_by_id(scenario.id)
    path = directory / scenario.initial_warnings_file
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    warnings = raw.get("warnings", [])
    return warnings if isinstance(warnings, list) else []

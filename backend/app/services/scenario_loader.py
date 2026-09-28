from pathlib import Path

import yaml

from simulator.scenarios.schema import ScenarioConfig


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


def load_scenario_by_id(scenario_id: str) -> ScenarioConfig:
    for scenario in list_scenarios():
        if scenario.id == scenario_id:
            return scenario
    raise KeyError(scenario_id)

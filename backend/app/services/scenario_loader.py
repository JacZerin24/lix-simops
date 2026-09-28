from pathlib import Path

import yaml

from simulator.scenarios.schema import ScenarioConfig


def load_scenario(path: str | Path) -> ScenarioConfig:
    scenario_path = Path(path)
    with scenario_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    return ScenarioConfig.model_validate(raw)

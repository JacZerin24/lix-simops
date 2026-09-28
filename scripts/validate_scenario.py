from pathlib import Path
import sys

import yaml

from simulator.scenarios.schema import ScenarioConfig


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "scenarios/mardi-gras/scenario.yaml")
    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    config = ScenarioConfig.model_validate(raw)
    print(f"Valid scenario: {config.id} — {config.name}")


if __name__ == "__main__":
    main()

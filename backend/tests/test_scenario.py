from backend.app.services.scenario_loader import load_scenario


def test_mardi_gras_scenario_loads() -> None:
    scenario = load_scenario("scenarios/mardi-gras/scenario.yaml")
    assert scenario.id == "mardi-gras-dss-001"
    assert "dss" in scenario.roles

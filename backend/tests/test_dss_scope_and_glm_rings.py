"""Protect operational DSS roles and verify event-specific GLM reference rings."""
from pathlib import Path
import re
import sys

from backend.app.services.scenario_loader import (
    load_scenario_by_id,
    load_scheduled_events,
    load_event_config,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from render_glm_flash_density import ring_config_from_event, floor_time
from datetime import datetime, timezone


def test_partner_messages_request_weather_not_command_decisions() -> None:
    events = load_scheduled_events(load_scenario_by_id("mardi-gras-dss-001"))
    messages = [event for event in events if event.kind == "partner_message"]
    assert len(messages) >= 7
    prohibited = [
        r"\bdo you recommend we\b",
        r"\bwhat action should\b",
        r"\bcan we resume\b",
        r"\bwhat should we tell route personnel\b",
        r"\bwhen would you want us to act\b",
        r"\bgive us a concise recommendation\b",
    ]
    for event in messages:
        text = event.body.lower()
        for pattern in prohibited:
            assert re.search(pattern, text) is None, (event.id, pattern)
        assert any(word in text for word in ("weather", "lightning", "storm"))


def test_weather_role_and_partner_decision_authority_are_explicit() -> None:
    config = load_event_config(load_scenario_by_id("mardi-gras-dss-001"))
    authority = config["partner"]["roles_and_decision_authority"]
    assert "DSS" in authority
    assert "Unified Command" in authority
    thresholds = {item["id"]: item for item in config["operations"]["decision_thresholds"]}
    assert "Unified Command" in thresholds["lightning-suspend"]["action"]
    assert "Unified Command" in thresholds["lightning-resume"]["action"]


def test_glm_rings_match_actual_endymion_event_thresholds() -> None:
    path = Path(__file__).resolve().parents[2] / "scenarios/mardi-gras/event.yaml"
    lat, lon, miles = ring_config_from_event(path)
    assert (lat, lon) == (29.9864, -90.1006)
    assert miles == [8, 12, 15]


def test_glm_bin_time_unchanged_by_event_rings() -> None:
    t = datetime(2021, 5, 12, 6, 3, tzinfo=timezone.utc)
    assert floor_time(t, 5) == datetime(2021, 5, 12, 6, 0, tzinfo=timezone.utc)

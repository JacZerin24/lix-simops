from datetime import datetime, timezone

from simulator.engine.clock import SimulationClock


def test_clock_advances_at_selected_speed() -> None:
    clock = SimulationClock(
        current=datetime(2027, 2, 1, 17, 0, tzinfo=timezone.utc),
        running=True,
        speed=2.0,
    )
    clock.advance(30)
    assert clock.current.minute == 1

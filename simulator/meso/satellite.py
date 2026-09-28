class SatelliteProvider:
    """Time-gated GOES imagery/provider interface."""

    def available_at(self, sim_time: str) -> list[dict]:
        return []

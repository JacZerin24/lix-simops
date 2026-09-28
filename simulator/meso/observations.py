class ObservationProvider:
    """Time-gated surface/upper-air observation provider interface."""

    def available_at(self, sim_time: str) -> list[dict]:
        return []

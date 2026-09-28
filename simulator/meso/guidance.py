class GuidanceProvider:
    """Time-gated environmental guidance provider interface."""

    def available_at(self, sim_time: str) -> list[dict]:
        return []

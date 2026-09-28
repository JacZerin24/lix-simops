class MrmsProvider:
    """Time-gated MRMS provider interface."""

    def available_at(self, sim_time: str) -> list[dict]:
        return []

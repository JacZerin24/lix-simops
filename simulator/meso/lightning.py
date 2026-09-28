class LightningProvider:
    """Time-gated GLM and LightningCast provider interface."""

    def available_at(self, sim_time: str) -> list[dict]:
        return []

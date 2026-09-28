from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .preprocessing import timestamp_from_filename


@dataclass(frozen=True)
class NexradVolume:
    site: str
    timestamp: datetime
    path: Path


class NexradProvider:
    """Index a local directory of archived NEXRAD Level II volumes."""

    def __init__(self, root: Path, site: str) -> None:
        self.root = root
        self.site = site.upper()

    def volumes(self) -> list[NexradVolume]:
        items: list[NexradVolume] = []
        if not self.root.exists():
            return items

        for path in sorted(self.root.iterdir()):
            if not path.is_file() or "MDM" in path.name:
                continue
            try:
                timestamp = timestamp_from_filename(path)
            except ValueError:
                continue
            items.append(
                NexradVolume(
                    site=self.site,
                    timestamp=timestamp,
                    path=path,
                )
            )
        return items

    def available_at(self, sim_time: str | datetime) -> list[NexradVolume]:
        if isinstance(sim_time, str):
            cutoff = datetime.fromisoformat(sim_time.replace("Z", "+00:00"))
        else:
            cutoff = sim_time
        return [volume for volume in self.volumes() if volume.timestamp <= cutoff]

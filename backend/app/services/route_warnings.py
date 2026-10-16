"""Exercise-only warning polygon overlap with the approximate Endymion route.

This is not a geodetically surveyed route geometry. It is a training aid for
automatic DSS notifications, not an operational polygon or safety determination.
"""
from __future__ import annotations

from typing import Any


def _orientation(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a: tuple[float, float], p: tuple[float, float], b: tuple[float, float]) -> bool:
    eps = 1e-10
    return (
        abs(_orientation(a, b, p)) < eps
        and min(a[0], b[0]) - eps <= p[0] <= max(a[0], b[0]) + eps
        and min(a[1], b[1]) - eps <= p[1] <= max(a[1], b[1]) + eps
    )


def _segments_touch(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
    d: tuple[float, float],
) -> bool:
    # Coordinates are longitude, latitude. Planar segment crossing is
    # sufficient at this city scale for an approximate exercise route.
    ab_c = _orientation(a, b, c)
    ab_d = _orientation(a, b, d)
    cd_a = _orientation(c, d, a)
    cd_b = _orientation(c, d, b)
    if (ab_c > 0 > ab_d or ab_d > 0 > ab_c) and (
        cd_a > 0 > cd_b or cd_b > 0 > cd_a
    ):
        return True
    return (
        _on_segment(a, c, b)
        or _on_segment(a, d, b)
        or _on_segment(c, a, d)
        or _on_segment(c, b, d)
    )


def _point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    x, y = point
    inside = False
    for i, p1 in enumerate(polygon):
        p2 = polygon[(i + 1) % len(polygon)]
        if _on_segment(p1, point, p2):
            return True
        if (p1[1] > y) != (p2[1] > y):
            cross_x = (p2[0] - p1[0]) * (y - p1[1]) / (p2[1] - p1[1]) + p1[0]
            if x < cross_x:
                inside = not inside
    return inside


def warning_intersects_route(
    warning_points: list[dict[str, float]],
    route_points: list[dict[str, float]],
) -> bool:
    """Return true when the polygon contains or crosses the exercise route."""
    if len(warning_points) < 3 or len(route_points) < 2:
        return False
    polygon = [(float(p["lon"]), float(p["lat"])) for p in warning_points]
    route = [(float(p["lon"]), float(p["lat"])) for p in route_points]
    if any(_point_in_polygon(point, polygon) for point in route):
        return True
    for p1, p2 in zip(route, route[1:]):
        for i, edge1 in enumerate(polygon):
            edge2 = polygon[(i + 1) % len(polygon)]
            if _segments_touch(p1, p2, edge1, edge2):
                return True
    return False


def route_centerline_from_config(config: dict[str, Any]) -> list[dict[str, float]]:
    """Read authored scenario reference coordinates; do not silently guess."""
    raw = (config.get("event") or {}).get("route_centerline") or []
    if not isinstance(raw, list):
        return []
    points = []
    for point in raw:
        if not isinstance(point, dict) or not {"lat", "lon"} <= point.keys():
            return []
        lat, lon = float(point["lat"]), float(point["lon"])
        if not -90 <= lat <= 90 or not -180 <= lon <= 180:
            return []
        points.append({"lat": lat, "lon": lon})
    return points

# Architecture

## Design goals

- One synchronized displaced-real-time clock for all participants.
- Role-specific interfaces rather than one overloaded dashboard.
- Scenario-driven behavior so new exercises do not require application rewrites.
- Reliable local operation during workshops.
- Raw weather archives remain outside GitHub.

## Logical flow

```text
Scenario configuration
        |
Simulation engine
        |
FastAPI / WebSocket session server
        |
+----------------+----------------+----------------+
|                |                |                |
Radar UI      Meso UI          DSS UI        Facilitator UI
```

## V0.1

The backend currently provides a health endpoint and a shared WebSocket clock. The frontend can switch among the four roles and the facilitator can start, pause, and change playback speed.

This is intentionally the foundation only. Meteorological viewers, persistence, authentication, scenario loading, and detailed team state come next.

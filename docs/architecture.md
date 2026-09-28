# Architecture

## Design goals

- One synchronized displaced-real-time clock per exercise session.
- Multiple teams can participate in the same exercise.
- Role-specific interfaces rather than one overloaded dashboard.
- Facilitators control pacing and simulated partner communications.
- Scenario-driven behavior so new exercises do not require application rewrites.
- Reliable local operation during workshops.
- Raw weather archives remain outside GitHub.

## Logical flow

```text
Scenario configuration
        |
Session Manager
        |
Simulation clock + event log
        |
FastAPI / WebSocket session server
        |
+----------------+----------------+----------------+
|                |                |                |
Radar UI      Meso UI          DSS UI        Facilitator UI
                                       |
                         partner control / injects
```

## Session model

A facilitator creates a session from a scenario. The backend assigns a six-character code and initializes the simulation clock from the scenario start time.

Participants connect to that code with:

- display name
- team
- role

The backend tracks presence and publishes it to all connected clients. Facilitators can see whether Radar, Meso, and DSS positions are staffed for each team.

## Event routing

- **Exercise injects** can target all users, one role, and optionally one team.
- **Partner messages** go only to the selected team's DSS meteorologist plus facilitators.
- **DSS responses** go to that team and facilitators.
- **Team messages** remain within the team and are observable by facilitators.
- All exercise events are timestamped with simulation time and retained for debrief.

## Next architecture milestone

V0.3 adds a time-gated archived radar data provider and interactive radar client while keeping the session/event layer unchanged.

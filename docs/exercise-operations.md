# Exercise operations

## Team structure

Each team contains:

- Radar Operator
- Mesoanalyst
- DSS Meteorologist

Facilitators remain unassigned to teams and float between groups while operating the simulation.

## Recommended workflow

1. Facilitator starts the session.
2. Participants join the assigned team and role.
3. All workstations verify the same simulation time.
4. Exercise control starts the displaced-real-time clock.
5. Radar and meso roles proactively feed information to DSS.
6. DSS owns partner communication and requests targeted analysis from teammates.
7. Facilitators release injects and troubleshoot without coaching toward a preferred answer.
8. Before closing the server, facilitators download the SimOps event log CSV for debrief.
9. Event logs and the external Shift Log are used together for the debrief.

## Failure mode

If live synchronization fails, pause the exercise rather than allowing teams to continue on mismatched simulation times.

Clients attempt to reconnect automatically after ordinary transient WebSocket drops. If a
client does not recover within a few seconds, pause, have that participant rejoin the same
session/team/role, verify the common simulation clock, and only then resume.

A page refresh in the same browser tab restores that tab's active connection settings.
A complete server-process restart still ends the in-memory session and requires a new
exercise session.

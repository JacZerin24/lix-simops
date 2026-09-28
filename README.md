# LIX SimOps

Role-based displaced-real-time weather operations and DSS training simulator for WFO LIX.

## Purpose

LIX SimOps is a reusable training platform for realistic, synchronized weather operations exercises. The first planned scenario is Mardi Gras DSS, but the platform is designed to support future severe weather, QLCS, tropical, flash flood, warning, and IDSS exercises.

## Core roles

- **Radar Operator** — interrogates archived radar data and communicates storm-scale trends.
- **Mesoanalyst** — monitors the environment, satellite, lightning, MRMS, observations, and guidance.
- **DSS Meteorologist** — owns the simulated partner relationship, event impacts, decisions, and communication.
- **Facilitator** — controls simulation time, injects, partner messages, team status, and debrief logging.

## Current V0.3 capabilities

1. Facilitator creates a live exercise session from a scenario pack.
2. The server generates a six-character session code.
3. Participants join a team as Radar, Mesoanalyst, or DSS.
4. All clients share one synchronized simulation clock.
5. Facilitator can start, pause, reset, and change playback speed.
6. Facilitator sees live team/role connection status.
7. Facilitator can release all-office, role-specific, or team-specific injects.
8. Facilitator can act as a simulated partner and message one team's DSS meteorologist.
9. DSS replies are timestamped against simulation time and visible to that team plus exercise control.
10. Exercise events are retained in an in-memory debrief log.
11. Archived NEXRAD Level II windows can be downloaded from the public archive and preprocessed into a scenario radar cache.
12. Radar operators can switch product/elevation, step through scans, loop available scans, zoom/pan, and jump back to the latest available scan.
13. Radar frame metadata is filtered on the backend by simulation time so future scans are never exposed to participant clients.

## Repository layout

```text
frontend/       React + TypeScript participant/facilitator UI
backend/        FastAPI + WebSocket API
simulator/      Simulation engine and scenario/data schemas
scenarios/      Exercise configuration packs
scripts/        Data download/build utilities
docs/           Architecture and operating documentation
data/           Local/generated data only; raw weather archives stay out of git
```

## Quick start

### Option 1 — Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Frontend: http://localhost:5173  
Backend health check: http://localhost:8000/health

### Exercise workflow

1. Open the frontend and enter a facilitator name.
2. Choose the Mardi Gras scenario and select **Create Session**.
3. Share the generated session code with participants.
4. Participants enter the code, select their assigned team and role, and join.
5. Confirm all three roles are connected for each team from Exercise Control.
6. Start the simulation clock.
7. Use Partner Control and Exercise Injects to drive the exercise.
8. Use the live event log during the debrief.

### Radar-case preparation

Install the separate radar-processing dependencies:

```bash
pip install -r scripts/requirements-data.txt
```

Then fetch the selected historical NEXRAD window and render the scenario cache. See **docs/radar-playback.md** for the exact commands and options.

### Option 2 — local development

Backend:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e backend
uvicorn backend.app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Scenario philosophy

Scenario configuration should live in `scenarios/<scenario-name>/`. Raw NEXRAD, GOES, MRMS, LightningCast, GLM, or other bulk weather data should **not** be committed to GitHub. Data download and preprocessing tools belong in `scripts/`; generated scenario data belongs in local/object storage.

See `docs/scenario-authoring.md` for the planned format.

## Planned milestones

- **V0.1:** synchronized clock and role workspace foundation
- **V0.2:** multi-team sessions, presence, facilitator controls, partner/DSS communications
- **V0.3:** interactive archived radar playback
- **V0.4:** mesoanalysis/environment workspace
- **V0.5:** complete Mardi Gras exercise scenario and debrief package

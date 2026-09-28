# LIX SimOps

Role-based displaced-real-time weather operations and DSS training simulator for WFO LIX.

## Purpose

LIX SimOps is a reusable training platform for realistic, synchronized weather operations exercises. The first planned scenario is Mardi Gras DSS, but the platform is designed to support future severe weather, QLCS, tropical, flash flood, warning, and IDSS exercises.

## Core roles

- **Radar Operator** — interrogates archived radar data and communicates storm-scale trends.
- **Mesoanalyst** — monitors the environment, satellite, lightning, MRMS, observations, and guidance.
- **DSS Meteorologist** — owns the simulated partner relationship, event impacts, decisions, and communication.
- **Facilitator** — controls simulation time, injects, partner messages, team status, and debrief logging.

## V0.1 goal

The first milestone is the multiplayer simulation framework:

1. Facilitator creates/runs a session.
2. Participants join a team and select a role.
3. All clients share one synchronized simulated clock.
4. Facilitator can start, pause, resume, and change playback speed.
5. Facilitator can release exercise injects.
6. Team and exercise events are logged for debrief.

Meteorological data viewers are layered on top of that foundation in later milestones.

## Repository layout

```text
frontend/       React + TypeScript participant/facilitator UI
backend/        FastAPI + WebSocket API
simulator/      Simulation engine and scenario schema
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

- **V0.1:** synchronized sessions, roles, facilitator controls, injects
- **V0.2:** DSS workspace and partner communications
- **V0.3:** interactive archived radar playback
- **V0.4:** mesoanalysis/environment workspace
- **V0.5:** complete Mardi Gras exercise scenario

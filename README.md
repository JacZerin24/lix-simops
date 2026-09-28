# LIX SimOps

Role-based displaced-real-time weather operations and DSS training simulator for WFO LIX.

## Purpose

LIX SimOps is a reusable training platform for realistic, synchronized weather operations exercises. The first full scenario is a 2027 Krewe of Endymion DSS exercise using a case-blind replay of the December 14, 2022 LIX severe-weather event.

## Core roles

- **Radar Operator** — interrogates archived radar data and communicates storm-scale trends.
- **Mesoanalyst** — monitors the environment, satellite, lightning, MRMS, observations, and guidance.
- **DSS Meteorologist** — owns the simulated partner relationship, event impacts, decisions, and communication.
- **Facilitator** — controls simulation time, injects, partner messages, team status, and debrief logging.

## Current V0.6 capabilities

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
11. Archived NEXRAD Level II windows can be downloaded and rendered into a time-gated radar cache.
12. Radar operators can switch product/elevation, step through scans, loop available scans, zoom/pan, and jump to the latest available scan.
13. Radar frame metadata is filtered on the backend so future scans are never exposed.
14. Mesoanalysts have synchronized Environment, Satellite, Lightning, MRMS, Observations, and Guidance workspaces.
15. Meso frames use the same backend time-gating model.
16. The Endymion scenario exposes route, partner priorities, and NWS-derived exercise thresholds directly in DSS.
17. Partner messages/injects can release automatically by simulation time, with facilitator override.
18. Historical weather data can be remapped onto the exercise date while preserving local clock time.
19. Google Classroom is the launch/resource/debrief layer while LIX SimOps remains authoritative for live timing.
20. The DSS workspace reserves a link for the coworker-owned Google Form → Google Sheet shift log.
21. The approved **December 14, 2022** source case is defined in a facilitator-only source-case file.
22. V0.6 includes acquisition tools for KLIX Level II, GOES-16 ABI/GLM, MRMS, and ASOS/METAR observations.
23. V0.6 stages the exact GOES-16 ABI L1b channels needed to reproduce historical LightningCast with CSPP Geo.
24. A raw-data inventory tool verifies that the source-case package has been populated before rendering.

## Exercise support tools

The Endymion exercise deliberately uses three systems together:

- **LIX SimOps** — authoritative live DRT, radar/meso products, partner messages, simulation clock, and facilitator control.
- **Google Classroom** — opening briefing, PowerPoint, reference materials, participant links, and post-exercise reflection.
- **Mock Shift Log** — coworker-owned Google Form feeding a Google Sheet; each DSS Meteorologist logs meaningful external communication.

Operational injects should remain in LIX SimOps rather than Classroom because the DRT can pause or change playback speed.

See:

- `docs/google-classroom-integration.md`
- `docs/mock-shift-log-integration.md`
- `docs/exercise-instruction-deck-outline.md`

## Repository layout

```text
frontend/       React + TypeScript participant/facilitator UI
backend/        FastAPI + WebSocket API
simulator/      Simulation engine and scenario/data schemas
scenarios/      Exercise configuration packs
scripts/        Data download/build/validation utilities
docs/           Architecture and operating documentation
data/           Local/generated data only; raw weather archives stay out of git
```

## Quick start

### Application

```bash
cp .env.example .env
docker compose up --build
```

Frontend: http://localhost:5173  
Backend health check: http://localhost:8000/health

### Exercise workflow

1. Open Google Classroom and the opening instruction deck.
2. Open LIX SimOps and create the exercise session.
3. Share the generated code.
4. Participants join the assigned team and role.
5. DSS Meteorologists open the coworker-provided mock shift-log Form.
6. Confirm Radar/Meso/DSS staffing for every team.
7. Start the simulation clock.
8. Let automatic partner messages/injects release by simulation time; override only when needed.
9. Use SimOps logs plus the Google Sheet shift log during debrief.

## V0.6 source-case acquisition

Install the data-tool dependencies:

```bash
pip install -r scripts/requirements-data.txt
```

Check public AWS availability without downloading:

```bash
python scripts/prepare_endymion_case.py --list-only
```

Download the raw source-case inputs:

```bash
python scripts/prepare_endymion_case.py
```

Inventory the downloaded package:

```bash
python scripts/validate_case_inventory.py --strict
```

The approved source-case configuration is:

```text
scenarios/mardi-gras/source-case.yaml
```

The acquisition window is **20:30–22:45 UTC on December 14, 2022**. Participant-facing data are later remapped to **February 6, 2027** while retaining local clock time.

See:

- `docs/v0.6-case-data.md`
- `docs/lightningcast-reproduction.md`
- `docs/source-case-timeline.md` — **facilitator-only; reveals the historical case**

## Radar rendering

See `docs/radar-playback.md`.

## Meso product preparation

Stage participant-ready environmental images in the directories defined by `scenarios/mardi-gras/meso-products.yaml`, then run:

```bash
python scripts/build_meso_cache.py \
  --scenario-id mardi-gras-dss-001 \
  --config scenarios/mardi-gras/meso-products.yaml \
  --simulation-date 2027-02-06 \
  --timezone America/Chicago
```

See `docs/meso-workspace.md`.

## Endymion scenario

The live scenario runs from **2:45–4:30 PM CST on February 6, 2027** at a default **1.5×** simulation speed. That provides 105 simulated minutes in about 70 wall-clock minutes.

Exercise lightning framework:

- 15 miles: elevated monitoring/preparation and lead-time calculations
- 12 miles: impending threat; protective action beginning/continuing as needed
- 8 miles: hold/suspend threatened operations
- organized convection: consider 30+ minutes of protective-action lead time
- resumption with professional real-time lightning support: beyond 8 miles, storm moving away, and no renewed strike threat within 8 miles

These are exercise defaults based on NWS large-venue guidance, not claimed City of New Orleans Mardi Gras policy.

## Milestones

- **V0.1:** synchronized clock and role workspaces
- **V0.2:** multi-team sessions and partner/DSS communications
- **V0.3:** archived radar playback
- **V0.4:** mesoanalysis/environment workspace
- **V0.5:** Endymion scenario, automatic timeline, external exercise-tool integration
- **V0.6:** approved December 14, 2022 source-case acquisition and validation
- **V0.7:** render GOES/GLM/MRMS/SPC products, reproduce LightningCast, and validate the complete end-to-end exercise package

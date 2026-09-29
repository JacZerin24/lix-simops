# LIX SimOps

Role-based displaced-real-time weather operations and DSS training simulator for WFO LIX.

## Purpose

LIX SimOps is a reusable training platform for realistic, synchronized weather operations exercises. The first full scenario is a 2027 Krewe of Endymion DSS exercise using a case-blind replay of the December 14, 2022 LIX severe-weather event.

## Core roles

- **Radar Operator** — interrogates archived radar data and communicates storm-scale trends.
- **Mesoanalyst** — monitors the environment, satellite, lightning, MRMS, observations, and guidance.
- **DSS Meteorologist** — owns the simulated partner relationship, event impacts, decisions, and communication.
- **Facilitator** — controls simulation time, injects, partner messages, team status, and debrief logging.

## Current V0.7 capabilities

1. Facilitator creates a live exercise session from a scenario pack.
2. Participants join teams as Radar, Mesoanalyst, or DSS and share one synchronized simulation clock.
3. Facilitators can start, pause, reset, change playback speed, see team staffing, and override automatic injects.
4. Partner messages and DSS responses are timestamped against simulation time and retained for debrief.
5. Archived KLIX Level II radar can be downloaded, rendered, time-remapped, and replayed without exposing future scans.
6. The Meso workspace supports Environment, Satellite, Lightning, MRMS, Observations, and Guidance products.
7. The Endymion scenario exposes route, partner priorities, and NWS-derived exercise thresholds directly in DSS.
8. Google Classroom is the participant launch/resource/debrief layer while LIX SimOps remains authoritative for live timing.
9. The DSS workspace reserves a link for the coworker-owned Google Form → Google Sheet shift log.
10. The approved December 14, 2022 source case is defined in a facilitator-only source-case file.
11. Public-source acquisition exists for NEXRAD, GOES-16 ABI/GLM, MRMS, RAP, and ASOS/METAR observations.
12. A public-archive smoke workflow verifies that the required December 14 source families are still available before case development.
13. GOES visible/IR, GLM flash density, MRMS, RAP environmental fields, and surface observations can be rendered into the meso workspace.
14. RAP 90-mb MLCAPE, 0–6 km bulk shear, and 0–1 km SRH are used as the environment fallback for this case rather than depending on the likely December 2022 SPC mesoanalysis image gap.
15. LightningCast inputs are staged from archived GOES-16 ABI C02/C05/C13/C15, validated scan-by-scan, and ready for external CSPP Geo processing.
16. Historical source keys remain server-side and are no longer exposed through participant radar/meso APIs.
17. A final validator checks exercise-date remapping, required product coverage, and participant asset paths before rehearsal.

## Exercise support tools

The Endymion exercise deliberately uses three systems together:

- **LIX SimOps** — authoritative live DRT, radar/meso products, partner messages, simulation clock, and facilitator control.
- **Google Classroom** — opening briefing, PowerPoint, reference materials, participant links, and post-exercise reflection.
- **Mock Shift Log** — coworker-owned Google Form feeding a Google Sheet; each DSS Meteorologist logs meaningful external communication.

Operational injects remain in LIX SimOps because the DRT can pause or change playback speed.

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
scripts/        Data download/render/build/validation utilities
docs/           Architecture and operating documentation
data/           Local/generated data only; raw weather archives stay out of git
```

## Application quick start

```bash
cp .env.example .env
docker compose up --build
```

Frontend: http://localhost:5173  
Backend health check: http://localhost:8000/health

## Exercise workflow

1. Open Google Classroom and the opening instruction deck.
2. Open LIX SimOps and create the exercise session.
3. Share the generated session code.
4. Participants join the assigned team and role.
5. DSS Meteorologists open the coworker-provided mock shift-log Form.
6. Confirm Radar/Meso/DSS staffing for every team.
7. Start the simulation clock.
8. Let automatic partner messages/injects release by simulation time; override only when needed.
9. Use SimOps logs plus the Google Sheet shift log during debrief.

## Build the Endymion weather package

Install the data dependencies:

```bash
pip install -r scripts/requirements-data.txt
```

Confirm the public archives:

```bash
python scripts/check_case_archives.py
```

Acquire the raw source-case inputs:

```bash
python scripts/prepare_endymion_case.py
```

Validate the raw inventory:

```bash
python scripts/validate_case_inventory.py --strict
```

Render all locally reproducible meso products and build the time-remapped cache:

```bash
python scripts/build_endymion_meso_inputs.py
```

Build radar, meso products, and run the final case validator:

```bash
python scripts/build_endymion_case.py
```

Once CSPP Geo LightningCast output has been staged, require it as part of the final validation:

```bash
python scripts/build_endymion_case.py --require-lightningcast
```

See:

- `docs/v0.6-case-data.md`
- `docs/v0.7-rendered-case.md`
- `docs/lightningcast-reproduction.md`
- `docs/source-case-timeline.md` — **facilitator-only; reveals the historical case**

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
- **V0.7:** participant-product rendering, RAP environment fallback, case-blindness hardening, and end-to-end cache validation
- **V0.8:** execute the full local source-case build, add CSPP LightningCast output, rehearse the complete exercise, and tune inject timing from the actual rendered data

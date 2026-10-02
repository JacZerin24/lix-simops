# LIX SimOps

Role-based displaced-real-time weather operations and DSS training simulator for WFO LIX.

## Purpose

LIX SimOps is a reusable platform for synchronized, case-blind weather operations exercises. The first full scenario is the **2027 Krewe of Endymion Severe Weather DSS Exercise** (`mardi-gras-dss-001`), built from archived KLIX-area weather on **May 12, 2021** and remapped to the exercise date.

The simulator is designed to let Radar, Mesoanalysis, and DSS participants work the event as if it were occurring live. Historical source identity and future information stay facilitator-side; post-T=0 warning decisions are made by participants.

## Endymion scenario

- **Exercise date:** February 6, 2027
- **Exercise window:** 2:45–4:30 PM CST
- **Default speed:** 1.5×
- **Historical source window:** May 12, 2021, 06:00–07:45 UTC / 1:00–2:45 AM CDT
- **Source → exercise offset:** +13 hours 45 minutes
- **Primary metro severe-weather anchor:** approximately 3:50–3:57 PM CST after displacement
- **Scenario timezone:** `America/Chicago`

The historical source mapping is defined in `scenarios/mardi-gras/source-case.yaml`, which is facilitator/developer metadata and is deliberately excluded from participant portable packages.

### Case-blindness rules

- Historical source timestamps are remapped to February 6, 2027 before participant delivery.
- Historical event names and source-case identifiers are not exposed through participant radar/meso APIs.
- Historical warnings after T=0 do **not** automatically appear. Warning decisions after T=0 are participant-generated.
- The framework can support warnings inherited at T=0, but inherited warnings are forked independently by team.
- Live historical reports use their documented event/observation times plus explicit exercise delivery delays.
- Later damage-survey confirmation is hindsight information and is not injected into the live participant timeline.
- Portable build checks reject known historical source-case identifiers and facilitator-only source metadata.

## Core roles

- **Radar Operator** — interrogates archived radar, tracks storms, issues warnings, and performs warning follow-up.
- **Mesoanalyst** — monitors environment, satellite, lightning, MRMS, observations, and guidance.
- **DSS Meteorologist** — owns the simulated partner relationship, impacts, decisions, and communication.
- **Facilitator** — controls simulation time, injects, reports, partner traffic, team status, and AAR review/export.

## Current capabilities

### Exercise control and teams

- Multi-team sessions with Radar, Mesoanalyst, and DSS roles.
- One synchronized simulation clock with start, pause, reset, and playback-speed controls.
- Exercise times display in Central time while backend timestamps remain UTC.
- Automatic scenario timeline with facilitator release-now, skip, and restore controls.
- Team-isolated warnings and participant state.

### Radar operations

- WebGL KLIX radar playback with **REF, VEL, CC, and ZDR**.
- Elevation/tilt selection, looping, frame stepping, keyboard shortcuts, and cursor sampling.
- Mouse-wheel zoom anchored on the cursor without scrolling the surrounding webpage.
- Distance/Bearing, Distance/Speed, and Storm Track tools.
- LIX boundaries, highways, event location, warnings, and storm-report overlays.
- Collision-aware storm-report labels to reduce clutter in dense report areas.
- Warning outlines and WarnGen previews close along the LIX boundary when clipped.

### WarnGen-style warning workflow

- One Storm and Line of Storms modes.
- Draggable **Drag Me to Storm** workflow.
- Historical-frame storm tracking and calculated motion vectors.
- Track-generated warning polygon.
- Editable polygon vertices.
- Middle-click add vertex / right-click remove vertex.
- Warned/Hatched Area preview.
- Warning attributes, Create Text, text review/edit, and Issue.
- Operational TOR/SVR durations.
- SVS follow-ups: **CON, COR, CAN, EXP**.
- CON may trim but not expand the existing warning.
- Initial NEW polygon is preserved separately from later CON trimming.

### Storm reports

- Manual and scheduled storm-report framework.
- Team/role gating and optional radar plotting.
- Historical Endymion report sequence uses contemporaneous May 12, 2021 observations with documented exercise delivery delays.
- Dense report labels are automatically decluttered while all report symbols remain plotted.

### Mesoanalysis workspace

- Product categories for Environment, Satellite, Lightning, MRMS, Observations, and Guidance.
- Frames are restricted to data available by the current simulation time.
- Previous/next frame buttons and loop playback.
- **Left Arrow / Right Arrow** navigate backward/forward through available frames.
- Manual frame navigation stops looping and holds the selected historical frame.
- **Send Meso Update to Team** records an analyst assessment together with the selected product/frame for the team AAR.
- RAP environment fallback includes mixed-layer CAPE, bulk shear, and storm-relative helicity fields.
- GOES/GLM, MRMS, RAP, and surface-observation products are supported by the case build.
- LightningCast reproduction remains an optional external CSPP Geo workflow and is not required by the active Endymion package.

### DSS workspace

- Partner messages and DSS responses timestamped against simulation time.
- Endymion event/route context and exercise decision thresholds.
- Link/reserved workflow for the coworker-owned Google Form → Google Sheet mock shift log.
- **Mark Shift Log Updated** records each DSS logging action in SimOps without duplicating the Google Form contents.

### Facilitator and AAR

- Warning visibility and warning/SVS history across teams.
- Radar AAR Timeline combining warning actions and released storm reports.
- Warning AAR Metrics for participant-issued NEW warnings:
  - NEW → first observed report timing
  - NEW → first released report timing
  - reports released while the warning was operationally active
  - report coverage using the **initial issued polygon**
  - reports outside the initial polygon
  - SVS follow-up timing from NEW
- Inherited T=0 warnings remain visible in the timeline but are excluded from participant-NEW performance metrics.
- Per-team warning summary.
- Integrated **Team Operations AAR** across warning actions, partner traffic, DSS responses, Meso updates, storm reports, injects, and shift-log markers.
- DSS metrics include answered/unanswered partner messages, FIFO response timing, response count, and shift-log update count/times.
- Downloadable warning CSV.
- Full AAR JSON export preserving session state, participants, schedule, events, warning text/polygons, SVS history, timeline, and computed metrics.

## Exercise support tools

The Endymion exercise deliberately uses three systems together:

- **LIX SimOps** — authoritative live displaced-real-time simulation, radar/meso products, partner messages, warnings, reports, simulation clock, and facilitator control.
- **Google Classroom** — opening briefing, presentation materials, participant resources, links, and post-exercise reflection.
- **Mock Shift Log** — coworker-owned Google Form feeding a Google Sheet; DSS Meteorologists log meaningful external communication.

Operational injects remain in LIX SimOps because the simulation may pause or change playback speed.

Relevant documentation includes:

- `docs/architecture.md`
- `docs/exercise-operations.md`
- `docs/google-classroom-integration.md`
- `docs/mock-shift-log-integration.md`
- `docs/exercise-instruction-deck-outline.md`
- `docs/radar-playback.md`
- `docs/meso-workspace.md`
- `docs/scenario-authoring.md`
- `docs/source-case-timeline.md` — **facilitator-only; reveals the historical case**
- `docs/lightningcast-reproduction.md`

## Repository layout

```text
frontend/       React + TypeScript participant/facilitator UI
backend/        FastAPI + WebSocket API
simulator/      Simulation engine and scenario/data schemas
scenarios/      Exercise configuration packs
scripts/        Data download/render/build/validation utilities
portable/       Windows portable-launch/update support
docs/           Architecture, operations, and exercise documentation
data/           Local/generated data only; raw weather archives stay out of git
```

## Development quick start

```bash
cp .env.example .env
docker compose up --build
```

Frontend: http://localhost:5173  
Backend health check: http://localhost:8000/health

## Portable Windows workflow

The repository includes a no-admin portable workflow for managed Windows computers:

**GitHub Actions → Build Portable Windows SimOps**

The workflow downloads a previously validated Endymion weather cache, builds the frontend, assembles the backend/simulator/scenario runtime, validates the package offline, tests the launcher, and publishes two artifacts:

- **`LIX-SimOps-Portable-Windows`** — full first-install package with launcher, offline wheelhouse, and validated weather cache.
- **`LIX-SimOps-App-Update`** — smaller source/frontend/scenario update for an already-working portable install. It intentionally contains no launcher, wheelhouse, weather cache, executable, DLL, PowerShell script, compiled Python extension, or wheel.

The full portable runtime uses `%LOCALAPPDATA%\LIX-SimOps` for its private Python environment and does not require administrator access.

`PACKAGE_INFO.txt` records the scenario, exercise date, validated case run ID, and application commit for traceability.

## Exercise workflow

1. Open Google Classroom and the opening instruction deck.
2. Start LIX SimOps and create a fresh Endymion exercise session.
3. Share the generated session code.
4. Participants join the assigned team and role.
5. DSS Meteorologists open the mock shift-log Form.
6. Confirm Radar/Meso/DSS staffing for each participating team.
7. Start the simulation clock.
8. Let scheduled partner messages/reports/injects release by simulation time; override only when needed.
9. Radar operators issue and follow up warnings based on participant decisions.
10. Use the Facilitator AAR Timeline, warning metrics, exports, and mock shift log during debrief.

## Build the Endymion weather package

Install the data dependencies:

```bash
pip install -r scripts/requirements-data.txt
```

Confirm the required public archives:

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

Render locally reproducible meso products and build the time-remapped cache:

```bash
python scripts/build_endymion_meso_inputs.py
```

Build radar/meso products and run the final case validator:

```bash
python scripts/build_endymion_case.py
```

LightningCast is optional and requires externally generated CSPP Geo output. When it has been staged, it can be required by validation:

```bash
python scripts/build_endymion_case.py --require-lightningcast
```

## Data sources

The Endymion case build currently supports:

- **KLIX NEXRAD Level II** — NOAA/Unidata public archive
- **GOES-16 ABI** — NOAA Open Data on AWS
- **GOES-16 GLM** — NOAA Open Data on AWS
- **MRMS** — NOAA Open Data on AWS
- **RAP analyses** — NOAA Rapid Refresh Open Data on AWS
- **ASOS/METAR observations** — Iowa Environmental Mesonet
- **Historical Local Storm Reports** — Iowa Environmental Mesonet archive, used with explicit provenance/limitations in facilitator-only metadata

Raw source data retain original timestamps only in facilitator-controlled storage. Participant cache manifests and assets are remapped to the exercise timeline.

## Development status

Completed/validated on the current radar-operations development line:

- synchronized multi-role exercise sessions
- case-blind May 12, 2021 → February 6, 2027 displacement
- rendered radar/meso case playback
- WarnGen-style TOR/SVR issuance and SVS follow-up
- team-isolated warning state
- historical report release framework and radar plotting
- warning AAR metrics and exports
- integrated team AAR, DSS response metrics, shift-log update tracking, and timestamped Meso team updates
- portable Windows first-install and app-update workflows
- Central-time participant displays
- radar report decluttering and CWA-clipped warning closure
- Meso left/right keyboard frame navigation

Next development focus is broader team AAR coverage across Radar, Meso, and DSS, followed by full Endymion rehearsal/tuning and documentation freeze before merge.

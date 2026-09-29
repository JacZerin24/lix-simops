# Endymion pre-rehearsal audit

This document records the full-system audit performed after the first successful portable
Windows rehearsal of the May 12, 2021 source case.

## Audit scope

The review covered:

- source-case timing and participant case blindness
- radar product rendering and participant controls
- mesoanalysis product selection, rendering, and time gating
- GLM, MRMS, RAP, and surface-observation usability
- Endymion event facts and exercise thresholds
- automatic partner-message timing
- DSS workflow and shift-log integration
- facilitator controls, team-presence display, and debrief logging
- WebSocket connection recovery
- portable Windows deployment and LAN documentation
- cache validation and build/rehearsal workflow

## Changes made from the audit

### Meteorology and displays

- Retained the user-provided GR/GR2Analyst CC and ZDR palettes.
- Corrected RAP 0–6 km vector wind-difference derivation.
- Added RAP 0–3 km bulk shear with sparse vectors and RAP 0–3 km SRH.
- Added city reference labels to operational meso maps with white text halos for readability.
- Decluttered the MSY/NEW surface-observation cluster using offset station-model labels.
- Increased MRMS AzShear low-signal masking and tightened the display range.
- Increased low-end precipitation-rate masking so trace/noise does not dominate.
- Added approximate 8/12/15-mile reference rings to GLM around a central Endymion
  route reference point, with explicit participant text that the entire moving route
  must still be considered.
- Added a small unobtrusive Endymion route-reference marker to radar frames.
- Retained near-zero MESH masking.
- Products with no actual frames remain hidden from the participant menu.
- Meso frames mapped beyond the exercise end are dropped during cache assembly.

### Scenario timing and participant experience

- Moved the first Operations Check-In from 2:50 PM to 2:52 PM so the first KLIX
  scan is available before the partner requests the initial briefing.
- Removed the timed lightning-framework reminder because the framework is already
  available in the briefing and DSS quick-reference panel; a timed reminder risked
  becoming an answer cue.
- Reworded the 4:05 PM hold message as an actual Unified Command status update rather
  than asking participants to pretend a hold occurred.
- Reworded the 4:20 PM resumption question to require explicit remaining-hazard and
  confidence reasoning.

### Facilitator and reliability

- Team Status always displays Teams 1–4, even while some teams have no connections.
- Duplicate occupants of one team/role are visibly flagged.
- The dashboard shows whether assigned positions are still missing.
- Playback-speed controls show the active speed.
- Start/Pause controls reflect the current run state.
- Reset now requires confirmation and states that the external Shift Log is unaffected.
- Facilitators can download the SimOps event log as CSV.
- Clients automatically attempt to reconnect after a transient WebSocket disconnect,
  but do not loop on invalid session/authentication errors.
- An active connection is restored after a page refresh in the same tab.
- Session codes avoid visually ambiguous I/O/0/1 characters.
- Released weather images are browser-cacheable to reduce repeated LAN transfers.
- The app distinguishes a completed exercise from an ordinary paused clock.
- Session snapshots expose scenario end time to support that state.

### Build and deployment

- LightningCast is marked optional until real CSPP Geo output is staged.
- Removed stale SRM and old meso-tab declarations from resource metadata.
- Updated portable-runtime documentation for the LocalAppData virtual environment.
- Portable dependency readiness is keyed to the requirements-file hash so a newer
  package refreshes its private environment when dependencies change.
- The launcher checks for a port-8000 collision and LAN mode prints candidate
  participant URLs without modifying firewall/security controls.
- The packaging workflow executes the actual Windows launcher in preflight mode before publishing.
- Updated day-of LAN instructions: portable mode uses port 8000; port 5173 is only
  for the Docker/Vite development path.
- Strengthened cache validation for radar and meso temporal coverage and post-end frames.
- Final case and portable artifacts retain for 45 days, with a final-package freeze
  checklist so workshop operation does not depend on short artifact retention.
- The portable participant runtime strips facilitator-only source metadata, excludes
  backend tests, scans for historical source identifiers, and includes only safe
  package/run traceability metadata.

## Public-information verification

The exercise date/time and current Mid-City route were rechecked against current
Endymion/Mardi Gras public information. The 2026 first-aid planning references remain
explicitly labeled as planning references rather than assumed 2027 locations.

The 15/12/8-mile lightning framework remains an exercise default based on the NWS
large-venue toolkit, which explicitly allows local modification based on venue size,
capacity, and sheltering time. It is not represented as City of New Orleans policy.

## Remaining external or rehearsal-dependent items

These are intentionally not solved in code and must be closed before the workshop:

1. **LightningCast** — process/stage the historical ABI inputs with CSPP Geo if the
   exercise team decides LightningCast is required.
2. **Shift Log URL** — add the coworker-owned Google Form link after it is finalized.
3. **Google Classroom URL/content** — finalize participant launch/resources/debrief.
4. **Office LAN test** — verify an IT-approved wired/wireless path can reach the
   portable host on TCP port 8000 without changing enterprise security controls.
5. **Three-device rehearsal** — run Radar, Meso, and DSS on separate participant
   devices and verify synchronized pause/resume, reconnect, product gating, and
   partner communication.
6. **Full timed rehearsal** — confirm that 3:35–4:20 PM partner questions align with
   the experience of participants, not only with facilitator knowledge of the source case.

## Known non-blocking technical debt

- Session state is in memory; a full server-process restart loses the active session.
- Radar is still rendered-frame playback rather than native GR2 geographic/radial data,
  so advanced GR2 functions such as arbitrary interrogation, data readout, and true
  storm-relative velocity are outside V0.8.
- Facilitator authentication is appropriate for a controlled workshop LAN but is not
  designed as internet-facing multi-user authentication.

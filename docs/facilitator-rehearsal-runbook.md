# Facilitator rehearsal runbook — Endymion DSS exercise

This is the facilitator-facing checklist for rehearsing and running the first full Endymion LIX SimOps exercise.

## Roles

Each participant team has:

- Radar Operator
- Mesoanalyst
- DSS Meteorologist

Facilitators remain outside the teams. One facilitator should primarily watch exercise control / partner messaging while the other floats between teams, handles technical problems, and observes teamwork.

## One week or more before the exercise

### Weather package

1. Confirm the final case cache is installed under:
   `data/cache/mardi-gras-dss-001/`
2. Run:
   `python scripts/validate_exercise_cache.py --require-lightningcast`
   when LightningCast has been staged.
3. If LightningCast is not yet available, run the validator without that flag and explicitly decide whether the exercise can proceed using GLM plus the other tools.
4. Open several radar and meso frames manually and visually inspect:
   - no May 2021 source date/time is visible
   - local valid times make sense
   - maps cover the intended LIX/New Orleans domain
   - product color scales are useful
   - surface observations are legible around MSY/NEW
   - weak/no-signal MRMS areas do not dominate the display
   - the most important evolution is visible around 3:35–4:10 PM simulation time

### Google Classroom

Confirm the Classroom has:

- Start Here
- Exercise Briefing
- Operational Reference Resources
- Participant Tools
- Debrief

Verify the live links to:

- LIX SimOps
- opening instruction deck
- coworker-owned Shift Log Google Form
- approved reference resources

Do not post the source-case timeline or any material identifying May 12, 2021.

### External-link readiness

Before the final rehearsal, resolve the two intentionally unconfigured external links:
- Google Classroom / participant launch page
- coworker-owned mock Shift Log Google Form

Do not treat a null/pending link as a software failure; it is a workshop-readiness item.

### Shift log

The coworker owning the Google Form / Sheet should test:

1. submit one dummy form response
2. verify it appears in the linked Sheet
3. confirm simulation-time and team fields are easy to use quickly
4. confirm facilitators have Sheet access
5. delete or label the test response before the exercise

## Full rehearsal

Run at least one complete rehearsal with three devices/browsers acting as one team.

### Before start

- Create a fresh SimOps session.
- Record the generated facilitator access key somewhere private; participants need only the six-character session code.
- If a second facilitator connects from another browser, give that person the facilitator key privately.
- Join as Radar, Meso, and DSS.
- Verify all three positions appear online in facilitator Team Status.
- Open the mock Shift Log on the DSS device.
- Verify simulation time starts at 2:45 PM CST.
- Confirm Radar and Meso show no future frames.
- Confirm participant APIs/UI do not expose the 2021 source date or historical clock time.

### During rehearsal

Check every automatic partner message against the actual rendered meteorology.

Important decision points:

| Sim time | Partner/exercise event | Rehearsal question |
|---|---|---|
| 2:52 PM | Operations check-in | The first KLIX scan is now available; do teams have enough information for an initial useful briefing? |
| 3:05 PM | Start-confidence question | Is uncertainty meaningful, not forced? |
| 3:20 PM | Protective-action lead time | Are lightning/environment/radar trends supporting a forward-looking answer? |
| 3:35 PM | Commit-to-route decision | Is this the right point to force a consequential recommendation? |
| 3:50 PM | Immediate command decision | Does the meteorology now justify urgency? |
| 4:05 PM | Operations during hold | Is the threat still active enough to make this realistic? |
| 4:20 PM | Resume question | Is there enough ambiguity/downstream risk to test all-clear reasoning? |

If the rendered data suggest any scripted message is too early or too late, adjust `scenarios/mardi-gras/injects.yaml` to the meteorology rather than forcing the case to fit the original schedule.

### Shift-log rehearsal

The DSS tester should make realistic entries for:

- initial briefing
- material timing/confidence update
- start/delay/hold recommendation
- immediate threat recommendation
- resumption/all-clear recommendation

Compare the Google Sheet timestamps/messages with the SimOps event log.

## Day-of-room setup

Recommended per team:

- Radar workstation/browser
- Meso workstation/browser
- DSS workstation/browser
- DSS Shift Log form open in a separate tab/window
- For the portable package, start `START_SIMOPS_LAN.bat` and open `http://HOST-IP:8000` on participant workstations. Use port 5173 only for the Docker/Vite development setup.

Facilitator station:

- SimOps facilitator dashboard
- linked Shift Log Google Sheet
- Google Classroom
- source-case timeline / facilitator notes
- optional projector showing only exercise-wide administrative information

Avoid projecting the live meteorology for everyone; the purpose is for each operational role to work its own tools and communicate.

## Opening briefing

Use the instruction PowerPoint before the clock starts.

Participants should understand:

- their assigned role
- what information each role owns
- that DSS owns external communication
- that DSS logs meaningful partner communication in the mock Shift Log
- that Classroom contains reference material, not live scenario injects
- that SimOps is the authoritative simulation clock
- that they should treat the case as live and not search for the historical event

## Starting the exercise

Do not start until:

- all expected positions are connected
- a participant workstation can load radar/meso frames through the LAN-hosted session
- DSS users have Shift Log open
- Classroom links work
- Radar/Meso products load
- facilitator automatic timeline is populated
- simulation clock reads 2:45 PM CST and is paused

Then start/resume at the planned playback speed.

## Facilitator behavior

Facilitators should troubleshoot and observe rather than coach teams toward the historical outcome.

Use unscripted partner follow-ups when a team's DSS communication is:

- unclear
- missing timing
- missing a recommendation
- too meteorological/jargon-heavy
- missing confidence/uncertainty
- failing to answer the partner's operational question

A good follow-up sounds like a real partner question, not an instructor hint.

## Technical fallback

If one participant role loses SimOps:

1. Pause the simulation.
2. Attempt reconnect/rejoin using the same session code.
3. Confirm the rejoined client receives current session state.
4. Resume only after the team has a common simulation time.

If the entire live application fails and cannot be restored promptly, use the opening/debrief material rather than trying to run an unsynchronized pseudo-live exercise. Preserve the scenario for another full run.

## Immediate debrief

Use both:

- SimOps event log
- coworker Shift Log Google Sheet

Focus on:

- when the team's concern increased
- what evidence triggered that change
- whether Radar/Meso information reached DSS in time
- whether DSS recommendations were clear/actionable
- whether the partner had enough lead time
- whether teams waited for a warning when earlier action was supportable
- what supported the all-clear/resumption decision

Do not make the debrief primarily about whether participants reproduced the exact historical warning outcome.

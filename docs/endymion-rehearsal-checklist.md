# Endymion full rehearsal checklist

> **Facilitator-only.** This document contains expected exercise timing and should not be distributed to participants before the exercise.

Use this checklist for the first complete end-to-end rehearsal of the **2027 Endymion Severe Weather DSS Exercise**. The purpose is to test the exercise as an operational training event, not merely to verify individual buttons.

## Rehearsal objective

Confirm that one complete Radar/Meso/DSS team can work the entire displaced-real-time scenario from **2:45–4:30 PM CST** while the facilitator can observe, troubleshoot, and reconstruct the team's decisions afterward.

The rehearsal should answer five questions:

- Does each role have a realistic and reasonably balanced workload?
- Do partner questions and storm reports arrive at useful decision points?
- Does information flow naturally from Radar/Meso → DSS → Unified Command?
- Does the severe-weather escalation occur with enough lead time for meaningful decisions?
- Does the Team Operations AAR accurately reconstruct what the team knew, communicated, and logged, and which actions the partner reported?

At the default **1.5×** playback speed, 105 minutes of simulation time requires about **70 minutes of uninterrupted wall-clock playback**, plus pauses, setup, and debrief.

## Before participants join

### Build and package

- [ ] Confirm the rehearsal machine is running the intended `LIX-SimOps-App-Update`.
- [ ] Confirm `PACKAGE_INFO.txt` shows the intended application commit.
- [ ] Confirm the validated Endymion cache is present and passes startup validation.
- [ ] Confirm the current branch/portable build includes Radar, Meso, DSS, Team Operations AAR, shift-log tracking, and Meso team updates.
- [ ] Confirm the browser opens SimOps without administrator privileges or security warnings.
- [ ] Confirm the facilitator has a way to record notes outside SimOps if a defect prevents normal AAR capture.

### Exercise-control setup

- [ ] Create a **fresh session** for `mardi-gras-dss-001`.
- [ ] Do not reuse a prior QA session.
- [ ] Verify the initial simulation time is **2:45 PM CST**.
- [ ] Verify the clock is **paused** before participants begin.
- [ ] Verify playback speed defaults to **1.5×**.
- [ ] Verify there are **no post-T=0 historical warnings** already displayed.
- [ ] Verify the automatic scenario timeline is loaded.
- [ ] Verify scheduled storm reports are still pending.
- [ ] Verify no participant-visible source-case/date information appears anywhere.

### Team setup

- [ ] Radar Operator joins the correct team.
- [ ] Mesoanalyst joins the same team.
- [ ] DSS Meteorologist joins the same team.
- [ ] Facilitator remains in the Facilitator role.
- [ ] All four screens show the same simulation time.
- [ ] Radar can display REF, VEL, CC, and ZDR.
- [ ] Meso products load and only show frames available by current simulation time.
- [ ] GLM range-ring layer toggles 8/12/15 mi with no future-frame leakage; reference rings are centered on Endymion start only, not the full moving route.
- [ ] DSS Event Operations information loads.
- [ ] DSS **View team warning footprints & route** opens a full-width read-only map showing the authored Endymion route; no warning issuance tools are available.
- [ ] Team 1 Radar issues a warning away from the route: Team 1 DSS receives the warning and **Review warning footprint on map** focuses the polygon without implying a confirmed route intersection.
- [ ] Team 1 Radar issues a warning intersecting the route: Team 1 DSS map shows the polygon over the route and Team 2 DSS does not receive Team 1 warnings.
- [ ] Radar sends a CON/COR that updates warning geometry: the DSS map updates to the latest polygon; CAN/EXP warnings no longer appear active.
- [ ] DSS reconnects during an active warning: the warning map and chat notice are reconstructed from the team-scoped warning snapshot.
- [ ] The map remains clearly marked as an **approximate exercise route**, not an operational surveyed GIS determination; DSS communicates weather and Unified Command owns actions.
- [ ] DSS has the real/mock Shift Log open in a separate tab if available.
- [ ] Meso can send a test update to the team if desired, then reset/recreate the session before the official rehearsal.
- [ ] Facilitator can see Team Status for all three participant roles.

## Ground rules for the rehearsal

- [ ] Treat the case as live and case-blind.
- [ ] Do not search for or identify the historical case.
- [ ] Do not look ahead in radar, meso, reports, or facilitator-only source material.
- [ ] Radar owns warning decisions.
- [ ] Meso proactively communicates environmental/storm-support information.
- [ ] DSS provides weather information, impacts, uncertainty, and threshold status; Unified Command owns operational decisions. DSS documents communications in the shift log.
- [ ] Internal team discussion should occur naturally; do not require every internal statement to be entered into SimOps.
- [ ] Meso should use **Send Meso Update to Team** for meaningful environmental assessments worth preserving in the AAR.
- [ ] DSS should click **Mark Shift Log Updated** once after each meaningful Google Form/shift-log submission.
- [ ] Facilitator should troubleshoot technical issues but should not coach the team toward a preferred meteorological or DSS decision.
- [ ] If synchronization fails, **pause the exercise** rather than allowing roles to continue at different simulation times.

## Live rehearsal timeline

| Sim time | Scheduled event / expected phase | What the team should be doing | Facilitator observations |
|---|---|---|---|
| **2:45 PM** | T=0 / pre-parade operations | Radar establishes storm picture; Meso establishes environment/lightning context; DSS reviews route, thresholds, and partner priorities. | Is there enough useful data immediately? Does each role know its scope without prompting? |
| **2:50 PM** | **Operations Check-In** partner message | DSS should synthesize Radar/Meso input into current weather picture and primary concern. | Time partner message → DSS response. Did Radar/Meso proactively provide input? Did DSS update the shift log? |
| **3:05 PM** | **Parade Start Confidence** | Team should be refining timing/confidence relative to 4 PM start. | Is there enough evolution by now to support a non-generic answer? Is Meso contributing? |
| **3:20 PM** | **Protective-Action Lead Time** | Team should discuss action timing before formal warning criteria are reached. | Does the team think beyond warning polygons? Is DSS giving actionable lead time? |
| **3:27 PM** | DSS-only **Lightning Decision Framework** reminder | DSS should communicate the partner's 15/12/8-mile weather thresholds and coordinate with Meso; partners choose any protective action. | Is this reminder useful or disruptive? Does it arrive too early/late? |
| **3:35 PM** | **Commit-to-Route Decision** | DSS gives a route-specific forecast including threat timing, impacts, threshold proximity, and confidence; Unified Command decides start/delay. | Is this a meaningful decision point? Does the team have enough evidence? Note whether answer feels forced or natural. |
| **3:35–3:49 PM** | Escalation period | Radar/Meso should recognize increasing threat; DSS should provide sufficient weather information for Unified Command's decisions. | Watch workload balance and internal communication. Is anyone idle or overloaded? |
| **~3:50 PM** | Primary metro severe-weather escalation begins | Radar warning decisions should emerge from the data; Meso should communicate environmental/storm trends; DSS should translate hazards into route-specific weather impacts, timing, and confidence. | Do **not** coach warning issuance. Record when the team first recognizes the threat, first warns, and first communicates actionable hazard thresholds. |
| **3:50 PM** | **Immediate Command Decision** partner message | DSS gives the most significant weather threat, exposed areas, threshold status, onset timing, and confidence; Unified Command decides the immediate action. | This is a key stress point. Is the timing productive or does it collide with too much Radar/Meso work? |
| **3:54 PM** | First historical observation occurs internally | No participant report has released yet. | A warning issued before this point should produce positive observation lead time in AAR. |
| **3:55 PM** | **62 mph Downtown Heliport gust** releases | Team incorporates first objective impact report. | Confirm report appears to intended roles/radar and AAR. Note whether it materially changes communication. |
| **3:57 PM** | **Uptown structural damage** releases | Escalating impact picture. | Check report label decluttering and team awareness. |
| **3:58 PM** | **Tree down near Tulane** releases | Continue warning/DSS follow-up as appropriate. | Is the growing report density manageable? |
| **3:59 PM** | Cohn/Lowerline damage observed internally | Report not yet released until 4:01. | Useful checkpoint for observation-vs-release AAR timing. |
| **4:01 PM** | **Power pole/tree damage — Uptown** releases | Team should recognize broadening significant impacts. | Check active warning coverage and any CON/COR decisions. |
| **4:03 PM** | **Power pole down — Algiers Point** releases | Impacts shift east/across river. | Does Radar warning geometry/follow-up still make operational sense? |
| **4:04 PM** | **Power lines/debris — Federal City** releases | Final scheduled historical impact report. | Confirm all six reports appear and Team AAR remains readable. |
| **4:05 PM** | **Operations During Hold** partner message | Assume parade is being held; DSS gives weather changes and threshold context; the partner controls operational and public-safety messaging and the hold. | Does the exercise transition naturally from warning response into ongoing IDSS? Did DSS log the communication? |
| **4:05–4:19 PM** | Post-impact / recovery assessment | Radar/Meso monitor whether threat is ending or another threat is approaching; DSS frames recovery criteria. | Is this period useful or does it feel dead? Does Meso still have meaningful work? |
| **4:20 PM** | **Resume Operations?** partner message | DSS reports remaining weather hazards, latest lightning, upstream trends, and confidence; Unified Command determines whether to resume. | Is enough information available to make recovery judgment? Does team avoid premature all-clear? |
| **4:20–4:30 PM** | Final monitoring / closeout | Finish necessary warning follow-up, final Meso update, partner communication, and shift-log entry. | Watch whether 10 minutes is too long/short. |
| **4:30 PM** | End of simulation window | Pause/stop. Do not continue into unseen future data. | Confirm all roles end on same time and AAR/export remain available. |

## Role-specific observations

### Radar Operator

- [ ] Can establish a useful baseline quickly at 2:45 PM.
- [ ] Uses multiple radar products/tilts rather than relying only on base reflectivity.
- [ ] Frame navigation and looping support—not hinder—analysis.
- [ ] Storm motion/track tools are usable under time pressure.
- [ ] Warning polygon creation feels operationally plausible.
- [ ] CWA clipping behaves correctly.
- [ ] NEW timing is reasonable relative to the evolving threat.
- [ ] SVS follow-up workflow is understandable.
- [ ] CON trimming is usable if needed.
- [ ] Storm reports remain readable as they cluster.
- [ ] Warning/report workload around 3:50–4:05 PM is challenging but manageable.
- [ ] No historical post-T=0 warning appears automatically.
- [ ] No technical issue forces the operator into an artificial decision.

### Mesoanalyst

- [ ] Has enough useful products at T=0 to establish environmental context.
- [ ] Product update frequency feels appropriate.
- [ ] GLM range-ring toggle shows the correct 8/12/15-mile references while preserving actual observed GLM flash density.
- [ ] Left/right arrow navigation is useful during active analysis.
- [ ] Latest-frame behavior is intuitive.
- [ ] Environment, satellite, lightning, MRMS, observations, and guidance complement rather than duplicate one another.
- [ ] Meso can identify meaningful changes before/through the severe escalation.
- [ ] **Send Meso Update to Team** is used for meaningful assessments, not routine clicks.
- [ ] Radar and DSS actually see Meso updates in the Exercise Feed.
- [ ] Meso remains useful during the post-impact/recovery phase.
- [ ] No product reveals future/source-case information.

### DSS Meteorologist

- [ ] Reads and understands partner messages without facilitator explanation.
- [ ] Requests targeted information from Radar/Meso when needed.
- [ ] Gives partner-facing answers rather than meteorological data dumps.
- [ ] Includes timing, locations/areas, impacts, established threshold status, and confidence without directing a partner action.
- [ ] Applies protective-action lead time rather than waiting only for warnings.
- [ ] Uses the lightning framework appropriately if relevant to the evolving data.
- [ ] Response workload is manageable around the 3:35–4:05 escalation.
- [ ] Partner-message → response timing is captured correctly.
- [ ] Answered/unanswered counts behave correctly.
- [ ] Opens/submits the external shift log for meaningful communications.
- [ ] Clicks **Mark Shift Log Updated** exactly once after each relevant submission.
- [ ] Shift-log count/times in SimOps match the external log entries.
- [ ] Recovery weather briefing at 4:20 PM is useful without DSS issuing an operational all-clear.

### Facilitator

- [ ] Can monitor all teams/roles without overwhelming screen clutter.
- [ ] Automatic injects release at the intended simulation times.
- [ ] No scheduled item releases early.
- [ ] Release-now/skip/restore remain available if needed.
- [ ] Can pause/resume/change speed without desynchronizing participants.
- [ ] Does not need to manually prompt teams to notice routine scheduled information.
- [ ] Team Operations AAR updates live.
- [ ] Warning AAR metrics remain correct.
- [ ] Meso updates appear with product/frame context.
- [ ] DSS response timings pair sensibly using FIFO matching.
- [ ] Shift-log update markers appear at the correct simulated times.
- [ ] Reconnecting as Facilitator preserves the full exercise event history.
- [ ] Full AAR JSON and Warning CSV download successfully at the end.

## Key pacing questions to answer during the run

Record **yes / no / adjust** plus notes for each:

| Question | Result | Notes |
|---|---|---|
| Does 2:45–2:50 provide enough startup time before the first partner request? |  |  |
| Is 2:50 partner check-in useful rather than too early? |  |  |
| Does the 3:05 forecast-timing request add useful new information rather than repeat 2:50? |  |  |
| Is the 3:20 lead-time question well placed? |  |  |
| Is the 3:27 lightning reminder useful and non-leading? |  |  |
| Is 3:35 the right time for a partner-requested route weather briefing? |  |  |
| Does the 3:50 weather status request create productive stress rather than overload? |  |  |
| Do 3:55–4:04 reports arrive at a useful cadence? |  |  |
| Is the 4:05 hold question appropriately timed after the impact burst? |  |  |
| Is 4:05–4:20 too quiet, too busy, or about right? |  |  |
| Is 4:20 a credible partner-requested recovery weather briefing? |  |  |
| Does the scenario need the manual contingency partner message? |  |  |
| Does 1.5× playback feel appropriate for all three roles? |  |  |
| Are pauses needed for training value, or only for technical issues? |  |  |

## Immediate post-run AAR QA

Before anyone closes the session:

- [ ] Select the rehearsed team in **Team Operations AAR**.
- [ ] Confirm partner-message count matches what was delivered.
- [ ] Confirm DSS-response count matches what was sent.
- [ ] Confirm answered/unanswered pairing makes sense.
- [ ] Confirm average response time is plausible.
- [ ] Confirm shift-log update count matches the external shift log.
- [ ] Confirm each Meso update appears with the intended product and frame time.
- [ ] Confirm warning NEW/SVS actions appear in chronological order.
- [ ] Confirm all six scheduled storm reports appear.
- [ ] Confirm initial warning polygon coverage metrics did not change after CON trimming.
- [ ] Confirm CAN/EXP ended warning-active report counting correctly.
- [ ] Confirm Central-time labels are consistent throughout.
- [ ] Download **Warning CSV**.
- [ ] Download **Full AAR JSON**.
- [ ] Reconnect the facilitator once, if practical, and confirm the full history/AAR still reconstructs correctly.

## Post-rehearsal participant questions

Ask each participant separately before group discussion:

1. Where did you feel underloaded or waiting for something to do?
2. Where did you feel overloaded or unable to keep up?
3. Was there a point where you knew what action was needed but the interface slowed you down?
4. Was there a point where the interface worked but the scenario did not give you enough information to decide?
5. Which partner question was most useful? Which felt repetitive or artificial?
6. Did information move naturally between Radar, Meso, and DSS?
7. Did the 1.5× speed feel realistic?
8. What is the single change that would most improve the exercise before running it for real?

## Facilitator disposition after rehearsal

Classify every issue found into one of these buckets before changing anything:

| Category | Examples | Action |
|---|---|---|
| **Defect** | wrong time, missing event, broken control, incorrect AAR calculation | Fix before next rehearsal |
| **Pacing** | inject too early/late, dead period, overload | Adjust scenario timing only |
| **Content** | unclear partner wording, missing resource, unnecessary reminder | Revise scenario/documentation |
| **Usability** | workflow technically works but is awkward | Prioritize based on operational impact |
| **Training choice** | team simply made a different defensible decision | Do **not** “fix” the simulator |
| **Nice-to-have** | cosmetic/nonessential enhancement | Defer until after scenario freeze |

## Rehearsal exit criteria

The Endymion scenario is ready to move toward scenario freeze when:

- [ ] No critical technical defect prevents any role from completing its job.
- [ ] No participant is routinely idle for long periods without an operational reason.
- [ ] The 3:35–4:05 escalation is demanding but workable.
- [ ] Partner questions create distinct, useful decisions.
- [ ] Radar warning operations can be completed without facilitator intervention.
- [ ] Meso contributes meaningful environmental updates before and during the severe phase.
- [ ] DSS can communicate, document the shift log, and maintain situational awareness.
- [ ] The recovery phase produces a meaningful resume/continue-hold discussion.
- [ ] The Team Operations AAR reconstructs the exercise accurately.
- [ ] Warning AAR metrics remain correct.
- [ ] Exports preserve the information needed for debrief.
- [ ] Case blindness remains intact.
- [ ] Any remaining issues are documented as minor tuning or deferred enhancements.

After these criteria are met, the next step should be **scenario timing/content tuning from rehearsal findings**, followed by a documentation/package freeze and a final dress rehearsal before considering PR #10 ready to merge.

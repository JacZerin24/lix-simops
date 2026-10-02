# Mock shift log integration

The mock shift log is **owned and built by the coworker helping facilitate the exercise**.

The planned implementation is:

```text
DSS Meteorologist
      |
      v
Google Form
      |
      v
Linked Google Sheet
      |
      v
Facilitator / debrief review
```

LIX SimOps should not duplicate that form or spreadsheet. The simulator keeps a configurable link so the DSS Meteorologist can open the form quickly, plus a **Mark Shift Log Updated** control. After submitting the real Google Form, the DSS Meteorologist clicks that control once so SimOps records the simulated time and team for AAR metrics. The marker confirms that an update was made; the Google Sheet remains authoritative for the entry contents.

## When to submit an entry

The DSS position should log each meaningful communication to or from the simulated Mardi Gras event coordinator / Unified Command, including:

- Initial status briefings
- Timing updates
- Recommendations to start, delay, hold, shelter, or resume
- Changes in threat/confidence
- Responses to specific partner questions
- All-clear/resumption guidance
- Any important inbound report from Event Command

Routine internal conversation between the Radar Operator, Mesoanalyst, and DSS Meteorologist does not need to be entered unless the exercise team decides otherwise.

## Recommended Google Form fields

The coworker can change these, but the form will be most useful for debrief if it captures:

1. Simulation time
2. Team
3. Direction — outbound to partner / inbound from partner
4. Partner/contact
5. Communication method
6. Message/request summary
7. DSS recommendation/response
8. Key timing information
9. Confidence/uncertainty
10. Follow-up needed / next update time
11. Initials

## Exercise use

The form link should be:

- Posted under **03 — Participant Tools** in Google Classroom
- Added to the DSS workspace configuration once finalized
- Included in the opening instruction PowerPoint
- Opened before the simulation clock starts

The linked Google Sheet can then be used during the debrief to compare the timing, wording, and evolution of partner communication across teams. SimOps AAR metrics separately show the number and simulated times of **Shift Log Updated** markers, allowing facilitators to compare communication activity with documented logging cadence without copying the form contents into SimOps.

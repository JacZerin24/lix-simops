import { FormEvent, useMemo, useState } from "react";

import type {
  ExerciseEvent,
  Participant,
  ScheduledExerciseItem,
  WarningRecord,
} from "../../types/simulation";
import { formatExerciseTime } from "../../utils/time";

type InjectDraft = {
  title: string;
  body: string;
  audience: string;
  target_team_id?: string;
};

type StormReportDraft = {
  title: string;
  body: string;
  audience: string;
  target_team_id?: string;
  report_kind: "tornado" | "hail" | "wind" | "report";
  lat: number;
  lon: number;
  magnitude?: string;
  source?: string;
  plot_on_radar: boolean;
  display_minutes: number;
};

type Props = {
  sessionCode: string;
  scenarioName: string;
  participants: Participant[];
  events: ExerciseEvent[];
  schedule: ScheduledExerciseItem[];
  warnings: WarningRecord[];
  onControl: (action: string, speed?: number) => void;
  onInject: (draft: InjectDraft) => void;
  onPartnerMessage: (teamId: string, sender: string, body: string) => void;
  onStormReport: (draft: StormReportDraft) => void;
  onScheduleControl: (
    itemId: string,
    action: "release_now" | "skip" | "restore",
  ) => void;
};

const roleLabels = {
  radar: "Radar",
  mesoanalyst: "Meso",
  dss: "DSS",
} as const;

function simTime(value?: string | null) {
  return formatExerciseTime(value, "Manual");
}

function minutesBetween(first: string, second: string) {
  return (new Date(second).getTime() - new Date(first).getTime()) / 60000;
}

function pointInPolygon(
  lat: number,
  lon: number,
  polygon: Array<{ lat: number; lon: number }>,
) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const xi = polygon[index].lon;
    const yi = polygon[index].lat;
    const xj = polygon[previous].lon;
    const yj = polygon[previous].lat;
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function deltaLabel(minutes: number, subject: string) {
  const rounded = Math.round(Math.abs(minutes) * 10) / 10;
  if (Math.abs(minutes) < 0.05) return `${subject}: same minute as NEW`;
  return minutes > 0
    ? `${subject}: +${rounded} min after NEW`
    : `${subject}: ${rounded} min before NEW`;
}

export function Facilitator({
  sessionCode,
  scenarioName,
  participants,
  events,
  schedule,
  warnings,
  onControl,
  onInject,
  onPartnerMessage,
  onStormReport,
  onScheduleControl,
}: Props) {
  const participantTeams = useMemo(
    () =>
      Array.from(
        new Set(
          participants
            .filter((participant) => participant.role !== "facilitator")
            .map((participant) => participant.team_id),
        ),
      ).sort(),
    [participants],
  );

  const teams = participantTeams.length > 0
    ? participantTeams
    : ["Team 1", "Team 2", "Team 3", "Team 4"];

  const radarAarTimeline = useMemo(() => {
    const items: Array<{
      id: string;
      time: string;
      kind: "warning" | "report";
      action: string;
      hazard?: string;
      team?: string;
      title: string;
      detail: string;
    }> = [];

    for (const warning of warnings) {
      const attributes = warning.attributes ?? {};
      const bearing =
        typeof attributes.motion_bearing_deg === "number"
          ? attributes.motion_bearing_deg
          : null;
      const speed =
        typeof attributes.motion_speed_kt === "number"
          ? attributes.motion_speed_kt
          : null;
      const trackType =
        typeof attributes.track_type === "string"
          ? attributes.track_type.replaceAll("_", " ")
          : null;

      items.push({
        id: `${warning.id}-new`,
        time: warning.issued_at,
        kind: "warning",
        action: warning.inherited ? "INHERITED" : "NEW",
        hazard: warning.hazard,
        team: warning.team_id,
        title: warning.label,
        detail: [
          `issued by ${warning.issuer}`,
          trackType ? `track: ${trackType}` : null,
          bearing != null && speed != null
            ? `motion ${bearing.toFixed(0).padStart(3, "0")}° @ ${speed.toFixed(0)} kt`
            : null,
          `expires ${simTime(warning.expires_at)}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });

      for (const followup of warning.followups ?? []) {
        const reason =
          typeof followup.attributes?.reason === "string"
            ? followup.attributes.reason.replaceAll("_", " ")
            : null;
        items.push({
          id: `${warning.id}-${followup.id}`,
          time: followup.issued_at,
          kind: "warning",
          action: followup.action,
          hazard: warning.hazard,
          team: warning.team_id,
          title: `${warning.label} follow-up`,
          detail: [
            `issued by ${followup.issuer}`,
            reason ? `reason: ${reason}` : null,
            followup.points?.length
              ? `${followup.points.length} polygon vertices`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }
    }

    for (const event of events) {
      if (event.type !== "storm_report" || !event.sim_time) continue;
      items.push({
        id: event.event_id ?? `report-${event.sim_time}-${event.lat}-${event.lon}`,
        time: event.sim_time,
        kind: "report",
        action: "REPORT",
        team: event.target_team_id ?? "All teams",
        title: [
          event.report_kind?.toUpperCase(),
          event.magnitude,
          event.title,
        ]
          .filter(Boolean)
          .join(" · "),
        detail: [
          event.source ? `source: ${event.source}` : null,
          event.observed_at && event.observed_at !== event.sim_time
            ? `observed ${simTime(event.observed_at)}`
            : null,
          `released ${simTime(event.sim_time)}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }

    return items.sort(
      (first, second) =>
        new Date(first.time).getTime() - new Date(second.time).getTime(),
    );
  }, [events, warnings]);

  const radarAarMetrics = useMemo(() => {
    const reports = events
      .filter(
        (event) =>
          event.type === "storm_report" &&
          event.sim_time &&
          event.lat != null &&
          event.lon != null,
      )
      .sort(
        (first, second) =>
          new Date(first.sim_time!).getTime() -
          new Date(second.sim_time!).getTime(),
      );

    return warnings
      .filter((warning) => !warning.inherited)
      .map((warning) => {
        const visibleReports = reports.filter((report) => {
          const target = report.target_team_id;
          const teamVisible = !target || target === "*" || target === warning.team_id;
          const radarVisible =
            !report.audience || report.audience === "all" || report.audience === "radar";
          return teamVisible && radarVisible;
        });

        const firstReleasedReport = visibleReports[0] ?? null;
        const firstObservedReport = visibleReports.reduce<ExerciseEvent | null>(
          (earliest, report) => {
            if (!earliest) return report;
            const reportObservedAt = report.observed_at ?? report.sim_time!;
            const earliestObservedAt = earliest.observed_at ?? earliest.sim_time!;
            return new Date(reportObservedAt).getTime() < new Date(earliestObservedAt).getTime()
              ? report
              : earliest;
          },
          null,
        );
        const firstObservedAt =
          firstObservedReport?.observed_at ?? firstObservedReport?.sim_time ?? null;

        const endFollowup = (warning.followups ?? [])
          .filter((followup) => followup.action === "CAN" || followup.action === "EXP")
          .sort(
            (first, second) =>
              new Date(first.issued_at).getTime() - new Date(second.issued_at).getTime(),
          )[0];
        const operationalEnd = endFollowup?.issued_at ?? warning.expires_at;
        const duringWarning = visibleReports.filter((report) => {
          const release = new Date(report.sim_time!).getTime();
          return (
            release >= new Date(warning.issued_at).getTime() &&
            release <= new Date(operationalEnd).getTime()
          );
        });

        const initialPolygon = warning.initial_points ?? warning.points;
        const coveredReports = duringWarning.filter((report) =>
          pointInPolygon(report.lat!, report.lon!, initialPolygon),
        );
        const followupTiming = [...(warning.followups ?? [])]
          .sort(
            (first, second) =>
              new Date(first.issued_at).getTime() - new Date(second.issued_at).getTime(),
          )
          .map((followup) => ({
            action: followup.action,
            minutes: minutesBetween(warning.issued_at, followup.issued_at),
          }));

        return {
          warning,
          firstReleaseDelta:
            firstReleasedReport?.sim_time
              ? minutesBetween(warning.issued_at, firstReleasedReport.sim_time)
              : null,
          firstObservedDelta:
            firstObservedAt
              ? minutesBetween(warning.issued_at, firstObservedAt)
              : null,
          duringWarningCount: duringWarning.length,
          coveredCount: coveredReports.length,
          followupTiming,
        };
      });
  }, [events, warnings]);

  const [partnerTeam, setPartnerTeam] = useState("Team 1");
  const [partnerSender, setPartnerSender] = useState("Event Command");
  const [partnerBody, setPartnerBody] = useState("");
  const [injectTitle, setInjectTitle] = useState("Exercise Inject");
  const [injectBody, setInjectBody] = useState("");
  const [injectAudience, setInjectAudience] = useState("all");
  const [injectTeam, setInjectTeam] = useState("");
  const [reportTitle, setReportTitle] = useState("Storm Report");
  const [reportKind, setReportKind] = useState<StormReportDraft["report_kind"]>("report");
  const [reportLat, setReportLat] = useState("");
  const [reportLon, setReportLon] = useState("");
  const [reportMagnitude, setReportMagnitude] = useState("");
  const [reportSource, setReportSource] = useState("Exercise report");
  const [reportBody, setReportBody] = useState("");
  const [reportAudience, setReportAudience] = useState("radar");
  const [reportTeam, setReportTeam] = useState("");
  const [reportPlotOnRadar, setReportPlotOnRadar] = useState(true);
  const [reportDisplayMinutes, setReportDisplayMinutes] = useState(60);

  const submitPartner = (event: FormEvent) => {
    event.preventDefault();
    const body = partnerBody.trim();
    if (!body) return;
    onPartnerMessage(partnerTeam, partnerSender.trim() || "Event Command", body);
    setPartnerBody("");
  };

  const submitInject = (event: FormEvent) => {
    event.preventDefault();
    const body = injectBody.trim();
    if (!body) return;
    onInject({
      title: injectTitle.trim() || "Exercise Inject",
      body,
      audience: injectAudience,
      target_team_id: injectTeam || undefined,
    });
    setInjectBody("");
  };

  const submitStormReport = (event: FormEvent) => {
    event.preventDefault();
    const lat = Number(reportLat);
    const lon = Number(reportLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    onStormReport({
      title: reportTitle.trim() || "Storm Report",
      body: reportBody.trim(),
      audience: reportAudience,
      target_team_id: reportTeam || undefined,
      report_kind: reportKind,
      lat,
      lon,
      magnitude: reportMagnitude.trim() || undefined,
      source: reportSource.trim() || "Exercise report",
      plot_on_radar: reportPlotOnRadar,
      display_minutes: reportDisplayMinutes,
    });
    setReportBody("");
    setReportMagnitude("");
  };

  return (
    <section className="facilitator-layout">
      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>Exercise Control</h2>
            <p className="muted">{scenarioName}</p>
          </div>
          <div className="session-code">
            <span>Session code</span>
            <strong>{sessionCode}</strong>
          </div>
        </div>

        <div className="controls">
          <button onClick={() => onControl("start")}>Start / Resume</button>
          <button onClick={() => onControl("pause")}>Pause</button>
          <button onClick={() => onControl("reset")}>Reset Exercise</button>
          {[0.5, 1, 1.5, 2, 4].map((speed) => (
            <button key={speed} onClick={() => onControl("speed", speed)}>
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Team Status</h2>
        <div className="team-grid">
          {teams.map((team) => (
            <article className="team-card" key={team}>
              <h3>{team}</h3>
              {(Object.keys(roleLabels) as Array<keyof typeof roleLabels>).map((role) => {
                const people = participants.filter(
                  (participant) => participant.team_id === team && participant.role === role,
                );
                return (
                  <div className="role-row" key={role}>
                    <span>{roleLabels[role]}</span>
                    <strong className={people.length ? "online" : "offline"}>
                      {people.length ? people.map((person) => person.display_name).join(", ") : "Not connected"}
                    </strong>
                  </div>
                );
              })}
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Warning Operations</h2>
        <p className="muted">
          Participant-issued warnings are shown here for facilitator awareness. Teams do not see
          one another&apos;s warning decisions.
        </p>
        {warnings.length === 0 ? (
          <p className="muted">No warnings have been issued.</p>
        ) : (
          <div className="facilitator-warning-list">
            {warnings.map((warning) => (
              <article className="facilitator-warning-row" key={warning.id}>
                <div>
                  <span className={`warning-badge ${warning.hazard.toLowerCase()}`}>
                    {warning.hazard}
                  </span>
                  <strong>{warning.label}</strong>
                  <span>{warning.team_id === "*" ? "Inherited" : warning.team_id}</span>
                </div>
                <div>
                  <span>{warning.status}</span>
                  <span>by {warning.issuer}</span>
                  <span>{simTime(warning.issued_at)} → {simTime(warning.expires_at)}</span>
                  {(warning.followups?.length ?? 0) > 0 && (
                    <span>
                      SVS {warning.followups?.length} · latest {warning.followups?.at(-1)?.action} at{" "}
                      {simTime(warning.followups?.at(-1)?.issued_at)}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Radar AAR Timeline</h2>
        <p className="muted">
          Reconstructs warning decisions and the storm reports that had been released by each point
          in simulated time. Unreleased reports never appear here.
        </p>
        {radarAarTimeline.length === 0 ? (
          <p className="muted">No radar warning/report activity yet.</p>
        ) : (
          <div className="radar-aar-list">
            {radarAarTimeline.map((item) => (
              <article className="radar-aar-row" key={item.id}>
                <div className="radar-aar-time">{simTime(item.time)}</div>
                <div className="radar-aar-action">
                  <span
                    className={
                      item.kind === "warning"
                        ? `warning-badge ${(item.hazard ?? "").toLowerCase()}`
                        : "report-badge"
                    }
                  >
                    {item.kind === "warning"
                      ? `${item.hazard ?? ""} ${item.action}`.trim()
                      : item.action}
                  </span>
                </div>
                <div className="radar-aar-copy">
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.team ?? "All teams"}</span>
                  </div>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Warning AAR Metrics</h2>
        <p className="muted">
          Participant-issued NEW warnings only. Uses the polygon issued with NEW, independent
          report release/observation timing, and subsequent SVS actions. Inherited T=0 warnings
          remain in the AAR timeline but are excluded here; CON trimming does not rewrite the
          initial-polygon score.
        </p>
        {radarAarMetrics.length === 0 ? (
          <p className="muted">Issue a warning to populate warning-performance metrics.</p>
        ) : (
          <div className="warning-metrics-grid">
            {radarAarMetrics.map((metric) => (
              <article className="warning-metric-card" key={metric.warning.id}>
                <div className="warning-metric-heading">
                  <span className={`warning-badge ${metric.warning.hazard.toLowerCase()}`}>
                    {metric.warning.hazard}
                  </span>
                  <strong>{metric.warning.team_id}</strong>
                  <span>{simTime(metric.warning.issued_at)} NEW</span>
                </div>

                <div className="warning-metric-values">
                  <span>
                    {metric.firstObservedDelta == null
                      ? "First observed report: none"
                      : deltaLabel(metric.firstObservedDelta, "First observed report")}
                  </span>
                  <span>
                    {metric.firstReleaseDelta == null
                      ? "First released report: none"
                      : deltaLabel(metric.firstReleaseDelta, "First released report")}
                  </span>
                  <span>
                    Initial polygon coverage: {metric.coveredCount}/{metric.duringWarningCount}{" "}
                    reports released while warning active (
                    {metric.duringWarningCount - metric.coveredCount} outside)
                  </span>
                  <span>
                    SVS timing:{" "}
                    {metric.followupTiming.length
                      ? metric.followupTiming
                          .map(
                            (followup) =>
                              `${followup.action} +${(
                                Math.round(followup.minutes * 10) / 10
                              ).toFixed(1)} min`,
                          )
                          .join(" · ")
                      : "no follow-ups"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Automatic Scenario Timeline</h2>
        <p className="muted">
          Pending items release automatically when the simulation clock reaches their scheduled time.
          Exercise control can release an item early, skip it, or restore a skipped item.
        </p>
        <div className="schedule-list">
          {schedule.length === 0 ? (
            <p className="muted">No scheduled events are configured for this scenario.</p>
          ) : (
            schedule.map((item) => (
              <article className={`schedule-row ${item.status}`} key={item.id}>
                <div className="schedule-time">
                  <strong>{simTime(item.due_at)}</strong>
                  <span>{item.at_sim_time}</span>
                </div>
                <div className="schedule-copy">
                  <div className="schedule-title">
                    <strong>{item.title}</strong>
                    <span>
                      {item.kind === "partner_message"
                        ? "Partner"
                        : item.kind === "storm_report"
                          ? "Storm Report"
                          : "Inject"}
                    </span>
                    <span className={`schedule-status ${item.status}`}>{item.status}</span>
                  </div>
                  <p>{item.body}</p>
                </div>
                <div className="schedule-actions">
                  {item.status !== "released" && (
                    <button onClick={() => onScheduleControl(item.id, "release_now")}>
                      Release now
                    </button>
                  )}
                  {item.status === "pending" && (
                    <button onClick={() => onScheduleControl(item.id, "skip")}>
                      Skip
                    </button>
                  )}
                  {item.status === "skipped" && (
                    <button onClick={() => onScheduleControl(item.id, "restore")}>
                      Restore
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="facilitator-columns">
        <form className="panel" onSubmit={submitPartner}>
          <h2>Partner Control</h2>
          <p className="muted">
            Use this for unscripted follow-ups. Scheduled partner messages are handled by the timeline above.
          </p>
          <div className="form-grid">
            <label>
              Team
              <select value={partnerTeam} onChange={(e) => setPartnerTeam(e.target.value)}>
                {teams.map((team) => <option key={team}>{team}</option>)}
              </select>
            </label>
            <label>
              Partner identity
              <input value={partnerSender} onChange={(e) => setPartnerSender(e.target.value)} />
            </label>
          </div>
          <label>
            Message
            <textarea
              value={partnerBody}
              onChange={(e) => setPartnerBody(e.target.value)}
              rows={4}
              placeholder="What is the partner asking or reporting?"
            />
          </label>
          <button className="primary-action" type="submit">Send Partner Message</button>
        </form>

        <form className="panel" onSubmit={submitInject}>
          <h2>Unscripted Exercise Inject</h2>
          <p className="muted">
            Release information to all participants, one role, or one specific team.
          </p>
          <div className="form-grid">
            <label>
              Title
              <input value={injectTitle} onChange={(e) => setInjectTitle(e.target.value)} />
            </label>
            <label>
              Audience
              <select value={injectAudience} onChange={(e) => setInjectAudience(e.target.value)}>
                <option value="all">All roles</option>
                <option value="radar">Radar operators</option>
                <option value="mesoanalyst">Mesoanalysts</option>
                <option value="dss">DSS meteorologists</option>
              </select>
            </label>
            <label>
              Team filter
              <select value={injectTeam} onChange={(e) => setInjectTeam(e.target.value)}>
                <option value="">All teams</option>
                {teams.map((team) => <option key={team}>{team}</option>)}
              </select>
            </label>
          </div>
          <label>
            Inject
            <textarea
              value={injectBody}
              onChange={(e) => setInjectBody(e.target.value)}
              rows={4}
              placeholder="Information to release at this simulation time"
            />
          </label>
          <button className="primary-action" type="submit">Release Inject</button>
        </form>

        <form className="panel" onSubmit={submitStormReport}>
          <h2>Storm Report Control</h2>
          <p className="muted">
            Release a geolocated report now. It remains hidden until you release it and can be
            limited to Radar or a single team.
          </p>
          <div className="form-grid">
            <label>
              Report type
              <select
                value={reportKind}
                onChange={(event) =>
                  setReportKind(event.target.value as StormReportDraft["report_kind"])
                }
              >
                <option value="tornado">Tornado</option>
                <option value="hail">Hail</option>
                <option value="wind">Wind</option>
                <option value="report">Other report</option>
              </select>
            </label>
            <label>
              Title
              <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
            </label>
            <label>
              Latitude
              <input
                inputMode="decimal"
                value={reportLat}
                onChange={(event) => setReportLat(event.target.value)}
                placeholder="29.9500"
                required
              />
            </label>
            <label>
              Longitude
              <input
                inputMode="decimal"
                value={reportLon}
                onChange={(event) => setReportLon(event.target.value)}
                placeholder="-90.1000"
                required
              />
            </label>
            <label>
              Magnitude / detail
              <input
                value={reportMagnitude}
                onChange={(event) => setReportMagnitude(event.target.value)}
                placeholder='e.g. 1.50" hail or 70 mph'
              />
            </label>
            <label>
              Source
              <input
                value={reportSource}
                onChange={(event) => setReportSource(event.target.value)}
              />
            </label>
            <label>
              Audience
              <select
                value={reportAudience}
                onChange={(event) => setReportAudience(event.target.value)}
              >
                <option value="radar">Radar operators</option>
                <option value="all">All roles</option>
                <option value="mesoanalyst">Mesoanalysts</option>
                <option value="dss">DSS meteorologists</option>
              </select>
            </label>
            <label>
              Team filter
              <select value={reportTeam} onChange={(event) => setReportTeam(event.target.value)}>
                <option value="">All teams</option>
                {teams.map((team) => <option key={team}>{team}</option>)}
              </select>
            </label>
            <label>
              Radar display
              <select
                value={reportDisplayMinutes}
                onChange={(event) => setReportDisplayMinutes(Number(event.target.value))}
              >
                {[30, 60, 90, 120].map((minutes) => (
                  <option value={minutes} key={minutes}>{minutes} min</option>
                ))}
              </select>
            </label>
            <label className="radar-check">
              <input
                type="checkbox"
                checked={reportPlotOnRadar}
                onChange={(event) => setReportPlotOnRadar(event.target.checked)}
              />
              Plot on radar
            </label>
          </div>
          <label>
            Report details
            <textarea
              value={reportBody}
              onChange={(event) => setReportBody(event.target.value)}
              rows={3}
              placeholder="Optional report detail shown in the exercise feed"
            />
          </label>
          <button className="primary-action" type="submit">Release Storm Report</button>
        </form>
      </div>

      <div className="panel">
        <h2>Live Exercise Log</h2>
        <div className="event-log">
          {events.length === 0 ? (
            <p className="muted">No logged exercise events yet.</p>
          ) : (
            [...events].reverse().slice(0, 20).map((event, index) => (
              <article className="event-row" key={event.event_id ?? index}>
                <span className="event-time">{simTime(event.sim_time)}</span>
                <strong>{event.type.replace("_", " ")}</strong>
                <span>
                  {(event.team_id === "*" ? "All teams" : event.team_id)
                    ?? event.target_team_id
                    ?? "All teams"}
                </span>
                <p>{event.body}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

import { FormEvent, useMemo, useState } from "react";

import type {
  ExerciseEvent,
  Participant,
  ScheduledExerciseItem,
  WarningRecord,
} from "../../types/simulation";
import { formatExerciseDateTime, formatExerciseTime } from "../../utils/time";

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

function roundedMinutes(value: number | null) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

  const teamAarSummaries = useMemo(() => {
    const grouped = new Map<
      string,
      {
        teamId: string;
        metrics: typeof radarAarMetrics;
        torCount: number;
        svrCount: number;
        followupCount: number;
        firstNew: string;
        lastAction: string;
      }
    >();

    for (const metric of radarAarMetrics) {
      const teamId = metric.warning.team_id;
      let summary = grouped.get(teamId);
      if (!summary) {
        summary = {
          teamId,
          metrics: [],
          torCount: 0,
          svrCount: 0,
          followupCount: 0,
          firstNew: metric.warning.issued_at,
          lastAction: metric.warning.issued_at,
        };
        grouped.set(teamId, summary);
      }

      summary.metrics.push(metric);
      if (metric.warning.hazard === "TOR") summary.torCount += 1;
      if (metric.warning.hazard === "SVR") summary.svrCount += 1;
      summary.followupCount += metric.followupTiming.length;

      if (new Date(metric.warning.issued_at).getTime() < new Date(summary.firstNew).getTime()) {
        summary.firstNew = metric.warning.issued_at;
      }

      for (const followup of metric.warning.followups ?? []) {
        if (new Date(followup.issued_at).getTime() > new Date(summary.lastAction).getTime()) {
          summary.lastAction = followup.issued_at;
        }
      }
      if (new Date(metric.warning.issued_at).getTime() > new Date(summary.lastAction).getTime()) {
        summary.lastAction = metric.warning.issued_at;
      }
    }

    return Array.from(grouped.values())
      .map((summary) => ({
        ...summary,
        metrics: [...summary.metrics].sort(
          (first, second) =>
            new Date(first.warning.issued_at).getTime() -
            new Date(second.warning.issued_at).getTime(),
        ),
      }))
      .sort((first, second) => first.teamId.localeCompare(second.teamId));
  }, [radarAarMetrics]);

  const dssTeamMetrics = useMemo(() => {
    return teams.map((teamId) => {
      const communicationEvents = events
        .filter(
          (event) =>
            event.sim_time &&
            ((event.type === "partner_message" &&
              (event.team_id === "*" || event.team_id === teamId)) ||
              (event.type === "dss_response" && event.team_id === teamId)),
        )
        .sort(
          (first, second) =>
            new Date(first.sim_time!).getTime() -
            new Date(second.sim_time!).getTime(),
        );

      const pending: ExerciseEvent[] = [];
      const responsePairs: Array<{
        message: ExerciseEvent;
        response: ExerciseEvent;
        minutes: number;
      }> = [];
      let unpromptedResponses = 0;

      for (const event of communicationEvents) {
        if (event.type === "partner_message") {
          pending.push(event);
          continue;
        }
        const message = pending.shift();
        if (!message?.sim_time || !event.sim_time) {
          unpromptedResponses += 1;
          continue;
        }
        responsePairs.push({
          message,
          response: event,
          minutes: minutesBetween(message.sim_time, event.sim_time),
        });
      }

      const partnerMessages = communicationEvents.filter(
        (event) => event.type === "partner_message",
      );
      const responses = communicationEvents.filter(
        (event) => event.type === "dss_response",
      );
      const shiftLogUpdates = events
        .filter(
          (event) =>
            event.type === "shift_log_update" &&
            event.team_id === teamId &&
            event.sim_time,
        )
        .sort(
          (first, second) =>
            new Date(first.sim_time!).getTime() -
            new Date(second.sim_time!).getTime(),
        );
      const mesoUpdates = events.filter(
        (event) => event.type === "meso_update" && event.team_id === teamId,
      );
      const averageResponseMinutes = responsePairs.length
        ? responsePairs.reduce((sum, pair) => sum + pair.minutes, 0) /
          responsePairs.length
        : null;

      return {
        teamId,
        partnerMessageCount: partnerMessages.length,
        responseCount: responses.length,
        answeredCount: responsePairs.length,
        unansweredCount: pending.length,
        unpromptedResponses,
        averageResponseMinutes,
        responsePairs,
        shiftLogUpdateCount: shiftLogUpdates.length,
        shiftLogTimes: shiftLogUpdates.map((event) => event.sim_time!),
        mesoUpdateCount: mesoUpdates.length,
      };
    });
  }, [events, teams]);

  const teamOperationsTimelines = useMemo(() => {
    return teams.map((teamId) => {
      const items: Array<{
        id: string;
        time: string;
        kind: string;
        title: string;
        detail: string;
      }> = [];

      for (const warning of warnings.filter(
        (warning) => warning.team_id === teamId || warning.team_id === "*",
      )) {
        items.push({
          id: `${warning.id}-team-new`,
          time: warning.issued_at,
          kind: warning.inherited ? "INHERITED" : `${warning.hazard} NEW`,
          title: warning.label,
          detail: `${warning.issuer} · expires ${simTime(warning.expires_at)}`,
        });
        for (const followup of warning.followups ?? []) {
          items.push({
            id: `${warning.id}-team-${followup.id}`,
            time: followup.issued_at,
            kind: `${warning.hazard} ${followup.action}`,
            title: `${warning.label} follow-up`,
            detail: followup.issuer,
          });
        }
      }

      for (const event of events) {
        if (!event.sim_time) continue;
        const teamScoped =
          event.team_id === teamId ||
          event.team_id === "*" ||
          event.target_team_id === teamId ||
          event.target_team_id === "*" ||
          (!event.team_id && !event.target_team_id);
        if (!teamScoped) continue;

        if (event.type === "partner_message") {
          items.push({
            id: event.event_id ?? `partner-${teamId}-${event.sim_time}`,
            time: event.sim_time,
            kind: "PARTNER",
            title: event.sender ?? "Event Command",
            detail: event.body,
          });
        } else if (event.type === "dss_response") {
          items.push({
            id: event.event_id ?? `dss-${teamId}-${event.sim_time}`,
            time: event.sim_time,
            kind: "DSS RESPONSE",
            title: event.sender ?? "DSS",
            detail: event.body,
          });
        } else if (event.type === "shift_log_update") {
          items.push({
            id: event.event_id ?? `shift-${teamId}-${event.sim_time}`,
            time: event.sim_time,
            kind: "SHIFT LOG",
            title: "Shift log updated",
            detail: event.sender ? `Marked by ${event.sender}` : "Update marked",
          });
        } else if (event.type === "meso_update") {
          items.push({
            id: event.event_id ?? `meso-${teamId}-${event.sim_time}`,
            time: event.sim_time,
            kind: "MESO",
            title: event.product_label || event.category || "Meso update",
            detail: [
              event.body,
              event.frame_time ? `frame ${simTime(event.frame_time)}` : null,
              event.sender ? `by ${event.sender}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          });
        } else if (event.type === "storm_report") {
          items.push({
            id: event.event_id ?? `report-${teamId}-${event.sim_time}`,
            time: event.sim_time,
            kind: "REPORT",
            title: [event.magnitude, event.title].filter(Boolean).join(" · ") || "Storm Report",
            detail: event.body || event.source || "Storm report released",
          });
        } else if (event.type === "inject") {
          items.push({
            id: event.event_id ?? `inject-${teamId}-${event.sim_time}`,
            time: event.sim_time,
            kind: "INJECT",
            title: event.title ?? "Exercise Inject",
            detail: event.body,
          });
        } else if (event.type === "team_message") {
          items.push({
            id: event.event_id ?? `team-${teamId}-${event.sim_time}`,
            time: event.sim_time,
            kind: (event.role ?? "team").toUpperCase(),
            title: event.sender ?? "Team message",
            detail: event.body,
          });
        }
      }

      return {
        teamId,
        items: items.sort(
          (first, second) =>
            new Date(first.time).getTime() - new Date(second.time).getTime(),
        ),
      };
    });
  }, [events, teams, warnings]);

  const exportBaseName = `lix-simops-${sessionCode.toLowerCase()}-aar`;

  const downloadAarJson = () => {
    const payload = {
      schema_version: 2,
      exported_at: new Date().toISOString(),
      exercise_timezone: "America/Chicago",
      session: {
        session_code: sessionCode,
        scenario_name: scenarioName,
      },
      participants,
      schedule,
      events,
      warnings,
      radar_aar_timeline: radarAarTimeline,
      warning_metrics: radarAarMetrics.map((metric) => ({
        warning_id: metric.warning.id,
        team_id: metric.warning.team_id,
        hazard: metric.warning.hazard,
        status: metric.warning.status,
        new_time: metric.warning.issued_at,
        new_time_local: formatExerciseDateTime(metric.warning.issued_at),
        first_observed_report_delta_minutes: roundedMinutes(metric.firstObservedDelta),
        first_released_report_delta_minutes: roundedMinutes(metric.firstReleaseDelta),
        reports_released_while_active: metric.duringWarningCount,
        reports_inside_initial_polygon: metric.coveredCount,
        reports_outside_initial_polygon:
          metric.duringWarningCount - metric.coveredCount,
        svs: (metric.warning.followups ?? []).map((followup) => ({
          ...followup,
          minutes_after_new: roundedMinutes(
            minutesBetween(metric.warning.issued_at, followup.issued_at),
          ),
        })),
      })),
      team_warning_summaries: teamAarSummaries.map((summary) => ({
        team_id: summary.teamId,
        warning_count: summary.metrics.length,
        tor_count: summary.torCount,
        svr_count: summary.svrCount,
        svs_count: summary.followupCount,
        first_new: summary.firstNew,
        last_warning_action: summary.lastAction,
        warning_ids: summary.metrics.map((metric) => metric.warning.id),
      })),
      dss_metrics: dssTeamMetrics.map((metric) => ({
        team_id: metric.teamId,
        partner_message_count: metric.partnerMessageCount,
        dss_response_count: metric.responseCount,
        answered_partner_messages: metric.answeredCount,
        unanswered_partner_messages: metric.unansweredCount,
        unprompted_dss_responses: metric.unpromptedResponses,
        average_response_minutes: roundedMinutes(metric.averageResponseMinutes),
        shift_log_update_count: metric.shiftLogUpdateCount,
        shift_log_update_times: metric.shiftLogTimes,
        meso_update_count: metric.mesoUpdateCount,
        response_pairs: metric.responsePairs.map((pair) => ({
          partner_message_id: pair.message.event_id,
          partner_message_time: pair.message.sim_time,
          dss_response_id: pair.response.event_id,
          dss_response_time: pair.response.sim_time,
          response_minutes: roundedMinutes(pair.minutes),
        })),
      })),
      team_operations_timeline: teamOperationsTimelines,
    };

    downloadTextFile(
      `${exportBaseName}.json`,
      `${JSON.stringify(payload, null, 2)}\n`,
      "application/json;charset=utf-8",
    );
  };

  const downloadWarningCsv = () => {
    const headers = [
      "session_code",
      "scenario_name",
      "team_id",
      "warning_id",
      "hazard",
      "label",
      "issuer",
      "status",
      "new_time_local",
      "new_time_iso",
      "expires_local",
      "expires_iso",
      "first_observed_report_delta_min",
      "first_released_report_delta_min",
      "reports_released_while_active",
      "reports_inside_initial_polygon",
      "reports_outside_initial_polygon",
      "svs_count",
      "svs_actions",
      "warning_text",
      "initial_polygon",
    ];

    const rows = radarAarMetrics.map((metric) => {
      const warning = metric.warning;
      return [
        sessionCode,
        scenarioName,
        warning.team_id,
        warning.id,
        warning.hazard,
        warning.label,
        warning.issuer,
        warning.status,
        formatExerciseDateTime(warning.issued_at),
        warning.issued_at,
        formatExerciseDateTime(warning.expires_at),
        warning.expires_at,
        roundedMinutes(metric.firstObservedDelta),
        roundedMinutes(metric.firstReleaseDelta),
        metric.duringWarningCount,
        metric.coveredCount,
        metric.duringWarningCount - metric.coveredCount,
        metric.followupTiming.length,
        metric.followupTiming
          .map(
            (followup) =>
              `${followup.action} +${roundedMinutes(followup.minutes)?.toFixed(1)} min`,
          )
          .join(" | "),
        warning.text ?? "",
        JSON.stringify(warning.initial_points ?? warning.points),
      ];
    });

    const csv = [
      headers.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\r\n");

    downloadTextFile(
      `${exportBaseName}-warnings.csv`,
      `${csv}\r\n`,
      "text/csv;charset=utf-8",
    );
  };

  const [aarTeam, setAarTeam] = useState("Team 1");
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

  const activeAarTeam = teams.includes(aarTeam) ? aarTeam : teams[0];
  const activeDssMetric = dssTeamMetrics.find(
    (metric) => metric.teamId === activeAarTeam,
  );
  const activeTeamTimeline =
    teamOperationsTimelines.find((timeline) => timeline.teamId === activeAarTeam)?.items ?? [];

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
        <div className="team-ops-header">
          <div>
            <h2>Team Operations AAR</h2>
            <p className="muted">
              Integrated Radar, Meso, DSS, partner, report, and shift-log chronology for one team.
              DSS response matching is FIFO: each response is paired to the oldest unanswered
              partner message.
            </p>
          </div>
          <label>
            Team
            <select value={activeAarTeam} onChange={(event) => setAarTeam(event.target.value)}>
              {teams.map((team) => (
                <option value={team} key={team}>{team}</option>
              ))}
            </select>
          </label>
        </div>

        {activeDssMetric && (
          <div className="team-ops-metrics">
            <article><span>Partner messages</span><strong>{activeDssMetric.partnerMessageCount}</strong></article>
            <article><span>Answered / unanswered</span><strong>{activeDssMetric.answeredCount} / {activeDssMetric.unansweredCount}</strong></article>
            <article>
              <span>Avg DSS response</span>
              <strong>
                {activeDssMetric.averageResponseMinutes == null
                  ? "—"
                  : `${roundedMinutes(activeDssMetric.averageResponseMinutes)} min`}
              </strong>
            </article>
            <article><span>DSS responses</span><strong>{activeDssMetric.responseCount}</strong></article>
            <article><span>Shift log updates</span><strong>{activeDssMetric.shiftLogUpdateCount}</strong></article>
            <article><span>Meso updates</span><strong>{activeDssMetric.mesoUpdateCount}</strong></article>
          </div>
        )}

        {activeDssMetric && activeDssMetric.responsePairs.length > 0 && (
          <div className="dss-response-pairs">
            <strong>DSS response timing</strong>
            {activeDssMetric.responsePairs.map((pair, index) => (
              <div key={pair.response.event_id ?? `response-pair-${index}`}>
                <span>{simTime(pair.message.sim_time)} partner → {simTime(pair.response.sim_time)} DSS</span>
                <strong>{roundedMinutes(pair.minutes)} min</strong>
              </div>
            ))}
          </div>
        )}

        <h3>Integrated team timeline</h3>
        {activeTeamTimeline.length === 0 ? (
          <p className="muted">No team operational activity has been recorded yet.</p>
        ) : (
          <div className="team-ops-timeline">
            {activeTeamTimeline.map((item) => (
              <article className="team-ops-row" key={item.id}>
                <div className="radar-aar-time">{simTime(item.time)}</div>
                <span className="team-event-badge">{item.kind}</span>
                <div className="team-ops-copy">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        )}
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
        <div className="aar-summary-header">
          <div>
            <h2>Team Warning Summary & Export</h2>
            <p className="muted">
              Groups participant warning performance by team. Exports capture the current session
              state, including warning polygons/text, SVS history, reports, schedule status, and
              the complete event log.
            </p>
          </div>
          <div className="aar-export-actions">
            <button
              type="button"
              onClick={downloadWarningCsv}
              disabled={radarAarMetrics.length === 0}
            >
              Download Warning CSV
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={downloadAarJson}
            >
              Download Full AAR JSON
            </button>
          </div>
        </div>

        {teamAarSummaries.length === 0 ? (
          <p className="muted">
            Participant-issued warnings will populate the team summary. The full JSON export is
            available at any time and also preserves non-warning exercise activity.
          </p>
        ) : (
          <div className="team-aar-grid">
            {teamAarSummaries.map((summary) => (
              <article className="team-aar-card" key={summary.teamId}>
                <div className="team-aar-heading">
                  <strong>{summary.teamId}</strong>
                  <span>
                    {summary.metrics.length} warning{summary.metrics.length === 1 ? "" : "s"} ·{" "}
                    {summary.followupCount} SVS
                  </span>
                </div>
                <div className="team-aar-overview">
                  <span>TOR {summary.torCount}</span>
                  <span>SVR {summary.svrCount}</span>
                  <span>First NEW {simTime(summary.firstNew)}</span>
                  <span>Last action {simTime(summary.lastAction)}</span>
                </div>

                <div className="team-aar-warning-list">
                  {summary.metrics.map((metric) => (
                    <div className="team-aar-warning" key={metric.warning.id}>
                      <div>
                        <span className={`warning-badge ${metric.warning.hazard.toLowerCase()}`}>
                          {metric.warning.hazard}
                        </span>
                        <strong>{simTime(metric.warning.issued_at)} NEW</strong>
                        <span>{metric.warning.status}</span>
                      </div>
                      <div>
                        <span>
                          Observed lead:{" "}
                          {metric.firstObservedDelta == null
                            ? "none"
                            : `${roundedMinutes(metric.firstObservedDelta)} min`}
                        </span>
                        <span>
                          Released lead:{" "}
                          {metric.firstReleaseDelta == null
                            ? "none"
                            : `${roundedMinutes(metric.firstReleaseDelta)} min`}
                        </span>
                        <span>
                          Initial polygon: {metric.coveredCount}/{metric.duringWarningCount}
                        </span>
                        <span>
                          SVS:{" "}
                          {metric.followupTiming.length
                            ? metric.followupTiming
                                .map(
                                  (followup) =>
                                    `${followup.action} +${roundedMinutes(
                                      followup.minutes,
                                    )?.toFixed(1)}`,
                                )
                                .join(" · ")
                            : "none"}
                        </span>
                      </div>
                    </div>
                  ))}
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

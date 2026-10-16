import type { ExerciseEvent, WarningRecord } from "../../types/simulation";

/**
 * The team-scoped warning_state snapshot is authoritative for issued products.
 * Prefer richer live notices when present; reconstruct any missing notices
 * from the snapshot so browser reconnects never suppress a DSS warning.
 */
export function buildDssChat(events: ExerciseEvent[], warnings: WarningRecord[]): ExerciseEvent[] {
  const chat: ExerciseEvent[] = events.filter(
    (event) =>
      event.type === "partner_message" ||
      event.type === "dss_response" ||
      event.type === "warning_route_notice",
  );

  const originalNotices = chat.filter((event) => event.type === "warning_route_notice");
  const claimed = new Set<ExerciseEvent>();

  const matchingNotice = (
    warningId: string,
    action: string,
    issuedAt?: string,
  ): ExerciseEvent | undefined => {
    const match = originalNotices.find((event) => {
      if (claimed.has(event) || event.warning_id !== warningId || event.action !== action) {
        return false;
      }
      // Issue and follow-up timestamps are generated from the same simulation
      // clock, but normalize them in case one uses Z and another +00:00.
      if (issuedAt && event.sim_time) {
        const actual = Date.parse(event.sim_time);
        const expected = Date.parse(issuedAt);
        if (Number.isFinite(actual) && Number.isFinite(expected) &&
            Math.abs(actual - expected) > 1000) {
          return false;
        }
      }
      return true;
    });
    if (match) claimed.add(match);
    return match;
  };

  const synthetic: ExerciseEvent[] = [];
  for (const warning of warnings) {
    // A pre-existing inherited warning is not a new operator issuance.
    if (warning.inherited) continue;

    if (!matchingNotice(warning.id, "issue", warning.issued_at)) {
      synthetic.push({
        type: "warning_route_notice",
        event_id: `warning-state:${warning.id}:issue`,
        warning_id: warning.id,
        action: "issue",
        team_id: warning.team_id,
        sender: "Radar Warning Desk",
        title: `Issued ${warning.label}`,
        hazard: warning.hazard,
        sim_time: warning.issued_at,
        warning_text: warning.text,
        body: `EXERCISE: ${warning.label} issued by ${warning.issuer}, valid through ${warning.expires_at ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" }).format(new Date(warning.expires_at)) : "the indicated expiration"}. Verify polygon coverage of the parade route and staging areas. DSS provides weather impacts and timing; Unified Command makes operational decisions.`,
      });
    }

    (warning.followups ?? []).forEach((followup) => {
      if (matchingNotice(warning.id, followup.action, followup.issued_at)) return;
      synthetic.push({
        type: "warning_route_notice",
        event_id: `warning-state:${warning.id}:followup:${followup.id}`,
        warning_id: warning.id,
        action: followup.action,
        team_id: warning.team_id,
        sender: "Radar Warning Desk",
        title: `${warning.label} · SVS ${followup.action}`,
        hazard: warning.hazard,
        sim_time: followup.issued_at,
        warning_text: followup.text,
        body: `EXERCISE: SVS ${followup.action} issued by ${followup.issuer} for the ${warning.label}. Review the updated warning text, hazards, and potential parade-route impacts. Unified Command retains all operational decisions.`,
      });
    });
  }

  // The fallback and live notice with the same warning/action are never both
  // shown. Keep partner messages and warning notifications in time order.
  return [...chat, ...synthetic].sort((a, b) => {
    const first = Date.parse(a.sim_time ?? "");
    const second = Date.parse(b.sim_time ?? "");
    return (Number.isFinite(first) ? first : 0) - (Number.isFinite(second) ? second : 0);
  });
}

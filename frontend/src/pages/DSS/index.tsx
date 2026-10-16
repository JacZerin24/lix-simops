import { FormEvent, useEffect, useMemo, useState } from "react";

import { getEventOperations } from "../../services/api";
import type { EventOperationsConfig, ExerciseEvent, WarningRecord } from "../../types/simulation";
import { buildDssChat } from "./communications";
import { formatExerciseTime } from "../../utils/time";

type Props = {
  sessionCode: string;
  events: ExerciseEvent[];
  warnings: WarningRecord[];
  onRespond: (body: string) => void;
  onShiftLogUpdated: () => void;
};

function simTime(value?: string) {
  return formatExerciseTime(value, "");
}

export function DSS({ sessionCode, events, warnings, onRespond, onShiftLogUpdated }: Props) {
  const [body, setBody] = useState("");
  const [operations, setOperations] = useState<EventOperationsConfig | null>(null);
  const [opsTab, setOpsTab] = useState<"overview" | "thresholds" | "route">("overview");
  const [error, setError] = useState("");

  useEffect(() => {
    getEventOperations(sessionCode)
      .then((payload) => {
        setOperations(payload);
        setError("");
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Unable to load event operations"),
      );
  }, [sessionCode]);

  const chat = useMemo(() => buildDssChat(events, warnings), [events, warnings]);
  const issuedWarnings = warnings.filter((warning) => !warning.inherited);
  const shiftLogUpdates = events.filter((event) => event.type === "shift_log_update");

  const thresholds = operations?.operations?.decision_thresholds ?? [];
  const shiftLog = operations?.communications?.mock_shift_log;
  const priorityThresholds = useMemo(
    () => thresholds.filter((item) => item.hazard === "lightning"),
    [thresholds],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value) return;
    onRespond(value);
    setBody("");
  };

  return (
    <section className="panel primary">
      <h2>DSS Meteorologist</h2>
      <p className="muted">
        Provide the partner with observed conditions, expected weather impacts, timing,
        threshold status, and confidence. Coordinate with Radar and Meso. Unified Command
        makes all parade start, hold, protective-action, and resumption decisions.
      </p>

      <div className="dss-layout">
        <div className="subpanel">
          <h3>Partner Communications</h3>
          <p className="muted dss-warning-sync">
            Radar warnings synchronized for this team: {issuedWarnings.length}
            {issuedWarnings.length === 0
              ? " · Verify the Radar and DSS top bars show the same session code and team."
              : " · Warning notices remain visible after reconnecting."}
          </p>
          <div className="chat-log">
            {chat.length === 0 ? (
              <p className="muted">No partner messages yet.</p>
            ) : (
              chat.map((item, index) => (
                <article
                  key={item.event_id ?? index}
                  className={
                    item.type === "dss_response"
                      ? "chat-message outgoing"
                      : item.type === "warning_route_notice"
                        ? "chat-message warning-notice"
                        : "chat-message incoming"
                  }
                >
                  <div className="chat-meta">
                    <strong>{item.sender ?? (item.type === "partner_message" ? "Event Command" : "DSS")}</strong>
                    <span>{simTime(item.sim_time)}</span>
                  </div>
                  {item.type === "warning_route_notice" && (
                    <div className="dss-warning-tag">
                      <strong>{item.title ?? "Radar warning issued"}</strong>
                      <span className={item.route_intersects ? "dss-route-impact" : "dss-route-review"}>
                        {item.route_intersects
                          ? "Approximate route overlap detected"
                          : "Review warning footprint for route impact"}
                      </span>
                      <span>Team {item.team_id?.replace(/^Team\s+/i, "") ?? ""} · Exercise alert</span>
                    </div>
                  )}
                  <p>{item.body}</p>
                  {item.type === "warning_route_notice" && item.warning_text && (
                    <details className="dss-warning-product">
                      <summary>Read {item.action === "issue" ? "issued warning" : "warning statement"}</summary>
                      <pre>{item.warning_text}</pre>
                    </details>
                  )}
                </article>
              ))
            )}
          </div>

          <div className="shift-log-callout">
            <div>
              <strong>Mock Shift Log</strong>
              <p>
                Log each meaningful communication to or from Event Command in the coworker-owned
                Google Form. After submitting the form, mark the update here so its timing is
                captured in the SimOps AAR.
              </p>
              <span className="shift-log-count">
                {shiftLogUpdates.length} shift log update{shiftLogUpdates.length === 1 ? "" : "s"} marked
              </span>
            </div>
            <div className="shift-log-actions">
              {shiftLog?.form_url ? (
                <a
                  className="primary-action shift-log-link"
                  href={shiftLog.form_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Shift Log
                </a>
              ) : (
                <button type="button" disabled title="The facilitator will add the Google Form link">
                  Shift Log Link Pending
                </button>
              )}
              <button type="button" onClick={onShiftLogUpdated}>
                Mark Shift Log Updated
              </button>
            </div>
          </div>

          <form className="composer" onSubmit={submit}>
            <label>
              Weather information to partner
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Current weather, affected areas, hazard timing, thresholds, expected impacts, and confidence. Unified Command decides operational actions."
                rows={4}
              />
            </label>
            <p className="muted">
              DSS informs and supports; Unified Command decides whether to start, hold, shelter, or resume.
            </p>
            <button className="primary-action" type="submit">Send Weather Update</button>
          </form>
        </div>

        <div className="subpanel dss-ops">
          <h3>Event Operations</h3>
          {error && <div className="error-text">{error}</div>}

          <div className="ops-tabs">
            <button
              className={opsTab === "overview" ? "ops-tab active" : "ops-tab"}
              onClick={() => setOpsTab("overview")}
            >
              Overview
            </button>
            <button
              className={opsTab === "thresholds" ? "ops-tab active" : "ops-tab"}
              onClick={() => setOpsTab("thresholds")}
            >
              Thresholds
            </button>
            <button
              className={opsTab === "route" ? "ops-tab active" : "ops-tab"}
              onClick={() => setOpsTab("route")}
            >
              Route
            </button>
          </div>

          {opsTab === "overview" && (
            <div className="ops-content">
              <h4>{operations?.event?.name ?? "Mardi Gras Parade Operations"}</h4>
              <dl className="ops-facts">
                <div>
                  <dt>Scheduled start</dt>
                  <dd>{operations?.event?.scheduled_start_local ?? "TBD"} local</dd>
                </div>
                <div>
                  <dt>Operational area</dt>
                  <dd>{operations?.event?.primary_operational_area ?? "TBD"}</dd>
                </div>
                <div>
                  <dt>Partner</dt>
                  <dd>{operations?.partner?.organization ?? "Event Command"}</dd>
                </div>
              </dl>

              {operations?.event?.crowd_note && <p>{operations.event.crowd_note}</p>}

              <h4>Lightning quick reference</h4>
              <div className="threshold-cards compact">
                {priorityThresholds.map((item) => (
                  <article className="threshold-card" key={item.id}>
                    <strong>{item.threshold}</strong>
                    <p>{item.action}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {opsTab === "thresholds" && (
            <div className="ops-content threshold-cards">
              {thresholds.map((item) => (
                <article className="threshold-card" key={item.id}>
                  <span>{item.hazard}</span>
                  <strong>{item.threshold}</strong>
                  <p>{item.action}</p>
                  <small>{item.basis}</small>
                </article>
              ))}
            </div>
          )}

          {opsTab === "route" && (
            <div className="ops-content">
              <h4>Endymion route</h4>
              {operations?.event?.route_map?.image_url && (
                <figure className="dss-route-map">
                  <a
                    href={operations.event.route_map.source_url || operations.event.route_map.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open the original Endymion route map in a new tab"
                  >
                    <img
                      src={operations.event.route_map.image_url}
                      alt={operations.event.route_map.image_alt ?? "Endymion parade route map"}
                      loading="lazy"
                    />
                  </a>
                  <figcaption>
                    {operations.event.route_map.caption}
                    <a
                      href={operations.event.route_map.source_url || operations.event.route_map.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open source map ↗
                    </a>
                  </figcaption>
                </figure>
              )}
              <ol className="route-list">
                {(operations?.event?.route ?? []).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              <h4>Recent first-aid planning reference</h4>
              <p className="muted">
                {operations?.operations?.first_aid_reference?.note}
              </p>
              <ul>
                {(operations?.operations?.first_aid_reference?.locations ?? []).map((location) => (
                  <li key={location}>{location}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

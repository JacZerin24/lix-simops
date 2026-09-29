import { FormEvent, useEffect, useMemo, useState } from "react";

import { getEventOperations } from "../../services/api";
import type { EventOperationsConfig, ExerciseEvent } from "../../types/simulation";
import { formatSimTime } from "../../utils/simTime";

type Props = {
  sessionCode: string;
  timezone: string;
  events: ExerciseEvent[];
  onRespond: (body: string) => void;
};

export function DSS({ sessionCode, timezone, events, onRespond }: Props) {
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

  const chat = events.filter(
    (event) => event.type === "partner_message" || event.type === "dss_response",
  );

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
        Own the partner relationship. Coordinate with radar and meso, then communicate one clear operational answer.
      </p>

      <div className="dss-layout">
        <div className="subpanel">
          <h3>Partner Communications</h3>
          <div className="chat-log">
            {chat.length === 0 ? (
              <p className="muted">No partner messages yet.</p>
            ) : (
              chat.map((item, index) => (
                <article
                  key={item.event_id ?? index}
                  className={item.type === "dss_response" ? "chat-message outgoing" : "chat-message incoming"}
                >
                  <div className="chat-meta">
                    <strong>{item.sender ?? (item.type === "partner_message" ? "Event Command" : "DSS")}</strong>
                    <span>{formatSimTime(item.sim_time, timezone)}</span>
                  </div>
                  <p>{item.body}</p>
                </article>
              ))
            )}
          </div>

          <div className="shift-log-callout">
            <div>
              <strong>Mock Shift Log</strong>
              <p>
                Log each meaningful communication to or from Event Command in the coworker-owned
                Google Form so it populates the shared exercise sheet.
              </p>
            </div>
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
          </div>

          <form className="composer" onSubmit={submit}>
            <label>
              Response to partner
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What are you telling the partner right now?"
                rows={4}
              />
            </label>
            <button className="primary-action" type="submit">Send DSS Response</button>
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

              {operations?.event?.pre_parade && (
                <div className="dss-context-callout">
                  <strong>{operations.event.pre_parade.name}</strong>
                  <span>{operations.event.pre_parade.location}</span>
                  <p>{operations.event.pre_parade.planning_note}</p>
                </div>
              )}

              {(operations?.partner?.partner_priorities?.length ?? 0) > 0 && (
                <>
                  <h4>Partner priorities</h4>
                  <ul className="partner-priority-list">
                    {operations?.partner?.partner_priorities?.map((priority) => (
                      <li key={priority}>{priority}</li>
                    ))}
                  </ul>
                </>
              )}

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

import { FormEvent, useState } from "react";

import type { ExerciseEvent } from "../../types/simulation";

type Props = {
  events: ExerciseEvent[];
  onRespond: (body: string) => void;
};

function simTime(value?: string) {
  if (!value) return "";
  return `${new Date(value).toISOString().slice(11, 16)}Z`;
}

export function DSS({ events, onRespond }: Props) {
  const [body, setBody] = useState("");
  const chat = events.filter(
    (event) => event.type === "partner_message" || event.type === "dss_response",
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
                    <span>{simTime(item.sim_time)}</span>
                  </div>
                  <p>{item.body}</p>
                </article>
              ))
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

        <div className="subpanel">
          <h3>Event Operations</h3>
          <p className="muted">
            Venue map, parade schedule, sheltering information, thresholds, and decision aids will be loaded from the scenario pack in the next milestone.
          </p>
        </div>
      </div>
    </section>
  );
}

import { FormEvent, useMemo, useState } from "react";

import type {
  ExerciseEvent,
  Participant,
  ScheduledExerciseItem,
} from "../../types/simulation";
import { formatSimTime } from "../../utils/simTime";

type InjectDraft = {
  title: string;
  body: string;
  audience: string;
  target_team_id?: string;
};

type Props = {
  sessionCode: string;
  scenarioName: string;
  participants: Participant[];
  events: ExerciseEvent[];
  schedule: ScheduledExerciseItem[];
  timezone: string;
  onControl: (action: string, speed?: number) => void;
  onInject: (draft: InjectDraft) => void;
  onPartnerMessage: (teamId: string, sender: string, body: string) => void;
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

export function Facilitator({
  sessionCode,
  scenarioName,
  participants,
  events,
  schedule,
  timezone,
  onControl,
  onInject,
  onPartnerMessage,
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

  const [partnerTeam, setPartnerTeam] = useState("Team 1");
  const [partnerSender, setPartnerSender] = useState("Event Command");
  const [partnerBody, setPartnerBody] = useState("");
  const [injectTitle, setInjectTitle] = useState("Exercise Inject");
  const [injectBody, setInjectBody] = useState("");
  const [injectAudience, setInjectAudience] = useState("all");
  const [injectTeam, setInjectTeam] = useState("");

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
                  <strong>{item.due_at ? formatSimTime(item.due_at, timezone) : "Manual"}</strong>
                  <span>{item.at_sim_time}</span>
                </div>
                <div className="schedule-copy">
                  <div className="schedule-title">
                    <strong>{item.title}</strong>
                    <span>{item.kind === "partner_message" ? "Partner" : "Inject"}</span>
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
      </div>

      <div className="panel">
        <h2>Live Exercise Log</h2>
        <div className="event-log">
          {events.length === 0 ? (
            <p className="muted">No logged exercise events yet.</p>
          ) : (
            [...events].reverse().slice(0, 20).map((event, index) => (
              <article className="event-row" key={event.event_id ?? index}>
                <span className="event-time">{formatSimTime(event.sim_time, timezone)}</span>
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

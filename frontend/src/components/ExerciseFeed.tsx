import type { ExerciseEvent } from "../types/simulation";
import { formatSimTime } from "../utils/simTime";

type Props = {
  events: ExerciseEvent[];
  timezone: string;
};

export function ExerciseFeed({ events, timezone }: Props) {
  const injects = events.filter((event) => event.type === "inject");

  return (
    <aside className="panel">
      <h2>Exercise Feed</h2>
      {injects.length === 0 ? (
        <p className="muted">No exercise injects released yet.</p>
      ) : (
        [...injects].reverse().map((inject, index) => (
          <article className="inject" key={inject.event_id ?? index}>
            <div className="chat-meta">
              <strong>{inject.title ?? "Exercise Inject"}</strong>
              <span>{formatSimTime(inject.sim_time, timezone)}</span>
            </div>
            <p>{inject.body}</p>
          </article>
        ))
      )}
    </aside>
  );
}

import type { ExerciseEvent } from "../types/simulation";
import { formatExerciseTime } from "../utils/time";

function simTime(value?: string) {
  return formatExerciseTime(value, "");
}

export function ExerciseFeed({ events }: { events: ExerciseEvent[] }) {
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
              <span>{simTime(inject.sim_time)}</span>
            </div>
            <p>{inject.body}</p>
          </article>
        ))
      )}
    </aside>
  );
}

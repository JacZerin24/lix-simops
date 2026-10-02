import type { ExerciseEvent } from "../types/simulation";
import { formatExerciseTime } from "../utils/time";

function simTime(value?: string) {
  return formatExerciseTime(value, "");
}

export function ExerciseFeed({ events }: { events: ExerciseEvent[] }) {
  const feedItems = events.filter(
    (event) => event.type === "inject" || event.type === "meso_update",
  );

  return (
    <aside className="panel">
      <h2>Exercise Feed</h2>
      {feedItems.length === 0 ? (
        <p className="muted">No exercise injects or team updates yet.</p>
      ) : (
        [...feedItems].reverse().map((item, index) => (
          <article
            className={item.type === "meso_update" ? "inject meso-team-update" : "inject"}
            key={item.event_id ?? index}
          >
            <div className="chat-meta">
              <strong>
                {item.type === "meso_update"
                  ? `Meso Update · ${item.product_label || item.category || "Analysis"}`
                  : item.title ?? "Exercise Inject"}
              </strong>
              <span>{simTime(item.sim_time)}</span>
            </div>
            <p>{item.body}</p>
            {item.type === "meso_update" && (
              <div className="feed-context">
                <span>{item.sender ?? "Mesoanalyst"}</span>
                {item.frame_time && <span>Frame {simTime(item.frame_time)}</span>}
              </div>
            )}
          </article>
        ))
      )}
    </aside>
  );
}

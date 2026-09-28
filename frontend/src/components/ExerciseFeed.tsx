import type { Inject } from "../types/simulation";

export function ExerciseFeed({ injects }: { injects: Inject[] }) {
  return (
    <aside className="panel">
      <h2>Exercise Feed</h2>
      {injects.length === 0 ? (
        <p className="muted">No injects released yet.</p>
      ) : (
        injects.map((inject, index) => (
          <article className="inject" key={index}>
            <strong>{inject.title}</strong>
            <p>{inject.body}</p>
          </article>
        ))
      )}
    </aside>
  );
}

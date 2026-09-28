type Props = {
  onControl: (action: string, speed?: number) => void;
};

export function Facilitator({ onControl }: Props) {
  return (
    <section className="panel">
      <h2>Exercise Control</h2>
      <div className="controls">
        <button onClick={() => onControl("start")}>Start / Resume</button>
        <button onClick={() => onControl("pause")}>Pause</button>
        {[0.5, 1, 1.5, 2, 4].map((speed) => (
          <button key={speed} onClick={() => onControl("speed", speed)}>
            {speed}×
          </button>
        ))}
      </div>
      <p className="muted">
        V0.1: synchronized clock and control channel. Team status, inject authoring,
        and scenario loading are next.
      </p>
    </section>
  );
}

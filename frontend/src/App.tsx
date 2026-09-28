import { useEffect, useMemo, useRef, useState } from "react";

type Role = "radar" | "mesoanalyst" | "dss" | "facilitator";

type Clock = {
  sim_time: string;
  running: boolean;
  speed: number;
};

type Inject = {
  title: string;
  body: string;
};

const WS_BASE = import.meta.env.VITE_WS_BASE ?? "ws://localhost:8000";

function App() {
  const [role, setRole] = useState<Role>("radar");
  const [teamId, setTeamId] = useState("Team 1");
  const [clock, setClock] = useState<Clock>({
    sim_time: new Date().toISOString(),
    running: false,
    speed: 1,
  });
  const [injects, setInjects] = useState<Inject[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(`${WS_BASE}/ws`);
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "clock") {
        setClock({
          sim_time: msg.sim_time,
          running: msg.running,
          speed: msg.speed,
        });
      }
      if (msg.type === "inject") {
        setInjects((current) => [{ title: msg.title, body: msg.body }, ...current]);
      }
    });

    return () => socket.close();
  }, []);

  const displayTime = useMemo(
    () => new Date(clock.sim_time).toLocaleString(undefined, { hour12: false }),
    [clock.sim_time],
  );

  const sendControl = (action: string, speed?: number) => {
    socketRef.current?.send(JSON.stringify({ type: "control", action, speed }));
  };

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>LIX SimOps</h1>
          <p>Displaced-real-time operations simulator</p>
        </div>
        <div className={connected ? "status good" : "status bad"}>
          {connected ? "Connected" : "Disconnected"}
        </div>
      </header>

      <section className="clockbar">
        <strong>SIM TIME</strong>
        <span>{displayTime}</span>
        <span>{clock.running ? `▶ ${clock.speed}×` : "⏸ PAUSED"}</span>
      </section>

      <section className="joinrow">
        <label>
          Team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option>Team 1</option>
            <option>Team 2</option>
            <option>Team 3</option>
            <option>Team 4</option>
          </select>
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="radar">Radar Operator</option>
            <option value="mesoanalyst">Mesoanalyst</option>
            <option value="dss">DSS Meteorologist</option>
            <option value="facilitator">Facilitator</option>
          </select>
        </label>
      </section>

      {role === "facilitator" ? (
        <section className="panel">
          <h2>Exercise Control</h2>
          <div className="controls">
            <button onClick={() => sendControl("start")}>Start / Resume</button>
            <button onClick={() => sendControl("pause")}>Pause</button>
            {[0.5, 1, 1.5, 2, 4].map((speed) => (
              <button key={speed} onClick={() => sendControl("speed", speed)}>
                {speed}×
              </button>
            ))}
          </div>
          <p className="muted">
            V0.1: synchronized clock and control channel. Team status, inject authoring,
            and scenario loading are next.
          </p>
        </section>
      ) : (
        <section className="workspace">
          <div className="panel primary">
            <h2>{workspaceTitle(role)}</h2>
            <p className="muted">{workspaceDescription(role)}</p>
            <div className="placeholder">
              {role === "radar" && "Interactive archived radar viewer will live here."}
              {role === "mesoanalyst" &&
                "Environment, satellite, lightning, MRMS, observations, and guidance will live here."}
              {role === "dss" &&
                "Event map, partner chat, event schedule, thresholds, and decision log will live here."}
            </div>
          </div>

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
        </section>
      )}
    </main>
  );
}

function workspaceTitle(role: Role) {
  if (role === "radar") return "Radar Operator";
  if (role === "mesoanalyst") return "Mesoanalyst";
  return "DSS Meteorologist";
}

function workspaceDescription(role: Role) {
  if (role === "radar") return "Storm-scale interrogation and timing.";
  if (role === "mesoanalyst") return "Environmental context and decision support to the team.";
  return "Partner communication, event impacts, and operational recommendations.";
}

export default App;

import { useEffect, useMemo, useRef, useState } from "react";

import { ExerciseFeed } from "./components/ExerciseFeed";
import { DSS } from "./pages/DSS";
import { Facilitator } from "./pages/Facilitator";
import { JoinSession } from "./pages/JoinSession";
import { Mesoanalyst } from "./pages/Mesoanalyst";
import { RadarOperator } from "./pages/RadarOperator";
import { createSimulationSocket } from "./services/socket";
import type { ClockState, Inject, Role } from "./types/simulation";

function App() {
  const [role, setRole] = useState<Role>("radar");
  const [teamId, setTeamId] = useState("Team 1");
  const [clock, setClock] = useState<ClockState>({
    sim_time: new Date().toISOString(),
    running: false,
    speed: 1,
  });
  const [injects, setInjects] = useState<Inject[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = createSimulationSocket();
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
        setInjects((current) => [
          { title: msg.title, body: msg.body, audience: msg.audience },
          ...current,
        ]);
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

      <JoinSession
        role={role}
        teamId={teamId}
        onRoleChange={setRole}
        onTeamChange={setTeamId}
      />

      {role === "facilitator" ? (
        <Facilitator onControl={sendControl} />
      ) : (
        <section className="workspace">
          {role === "radar" && <RadarOperator />}
          {role === "mesoanalyst" && <Mesoanalyst />}
          {role === "dss" && <DSS />}
          <ExerciseFeed injects={injects} />
        </section>
      )}
    </main>
  );
}

export default App;

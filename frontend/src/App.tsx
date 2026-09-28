import { useEffect, useMemo, useRef, useState } from "react";

import { ExerciseFeed } from "./components/ExerciseFeed";
import { DSS } from "./pages/DSS";
import { Facilitator } from "./pages/Facilitator";
import { JoinSession } from "./pages/JoinSession";
import { Mesoanalyst } from "./pages/Mesoanalyst";
import { RadarOperator } from "./pages/RadarOperator";
import { createSession, listScenarios } from "./services/api";
import { createSimulationSocket } from "./services/socket";
import type {
  ClockState,
  ExerciseEvent,
  Participant,
  Role,
  ScenarioSummary,
  ScheduledExerciseItem,
} from "./types/simulation";

type InjectDraft = {
  title: string;
  body: string;
  audience: string;
  target_team_id?: string;
};

const exerciseEventTypes = new Set([
  "inject",
  "partner_message",
  "dss_response",
  "team_message",
]);

function App() {
  const [role, setRole] = useState<Role>("radar");
  const [teamId, setTeamId] = useState("Team 1");
  const [displayName, setDisplayName] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [activeSessionCode, setActiveSessionCode] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const [clock, setClock] = useState<ClockState>({
    sim_time: new Date().toISOString(),
    running: false,
    speed: 1,
  });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [events, setEvents] = useState<ExerciseEvent[]>([]);
  const [schedule, setSchedule] = useState<ScheduledExerciseItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    listScenarios()
      .then((items) => {
        setScenarios(items);
        if (items.length > 0) setScenarioId(items[0].id);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load scenarios"));
  }, []);

  useEffect(() => {
    if (!activeSessionCode) return;

    const socket = createSimulationSocket({
      sessionCode: activeSessionCode,
      displayName,
      teamId,
      role,
    });
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnected(true);
      setError("");
    });
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "session_state") {
        setClock({
          sim_time: msg.sim_time,
          running: msg.running,
          speed: msg.speed,
        });
        setScenarioName(msg.scenario_name);
        setParticipants(msg.participants ?? []);
        setSchedule(msg.schedule ?? []);
      } else if (msg.type === "clock") {
        setClock({
          sim_time: msg.sim_time,
          running: msg.running,
          speed: msg.speed,
        });
      } else if (msg.type === "presence") {
        setParticipants(msg.participants ?? []);
      } else if (msg.type === "schedule") {
        setSchedule(msg.items ?? []);
      } else if (msg.type === "event_history") {
        setEvents(msg.events ?? []);
      } else if (exerciseEventTypes.has(msg.type)) {
        setEvents((current) => [...current, msg as ExerciseEvent]);
      } else if (msg.type === "error") {
        setError(msg.message ?? "Exercise server error");
      }
    });

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [activeSessionCode]);

  const displayTime = useMemo(
    () => new Date(clock.sim_time).toISOString().replace("T", " ").slice(0, 19) + "Z",
    [clock.sim_time],
  );

  const send = (payload: object) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Not connected to the exercise session.");
      return;
    }
    socket.send(JSON.stringify(payload));
  };

  const join = () => {
    if (!displayName.trim()) {
      setError("Enter your name before joining.");
      return;
    }
    if (!sessionCode.trim()) {
      setError("Enter the exercise session code.");
      return;
    }
    setError("");
    setEvents([]);
    setParticipants([]);
    setSchedule([]);
    setActiveSessionCode(sessionCode.trim().toUpperCase());
  };

  const createExercise = async () => {
    if (!displayName.trim()) {
      setError("Enter your name before creating the exercise.");
      return;
    }
    if (!scenarioId) {
      setError("Choose a scenario.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const created = await createSession(scenarioId);
      setRole("facilitator");
      setTeamId("FACILITATOR");
      setSessionCode(created.session_code);
      setScenarioName(created.scenario_name);
      setEvents([]);
      setParticipants([]);
      setSchedule(created.schedule ?? []);
      setActiveSessionCode(created.session_code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create session");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    setActiveSessionCode(null);
    setConnected(false);
    setParticipants([]);
    setEvents([]);
    setSchedule([]);
    setScenarioName("");
    setError("");
    if (role === "facilitator") {
      setRole("radar");
      setTeamId("Team 1");
    }
  };

  const sendControl = (action: string, speed?: number) => {
    send({ type: "control", action, speed });
  };

  const sendInject = (draft: InjectDraft) => {
    send({ type: "inject", ...draft });
  };

  const sendPartnerMessage = (targetTeam: string, sender: string, body: string) => {
    send({
      type: "partner_message",
      team_id: targetTeam,
      sender,
      body,
    });
  };

  const sendDssResponse = (body: string) => {
    send({ type: "dss_response", body });
  };

  const controlScheduledEvent = (
    itemId: string,
    action: "release_now" | "skip" | "restore",
  ) => {
    send({ type: "scheduled_event_control", item_id: itemId, action });
  };

  if (!activeSessionCode) {
    return (
      <main>
        <header className="topbar">
          <div>
            <h1>LIX SimOps</h1>
            <p>Displaced-real-time weather operations and DSS training</p>
          </div>
        </header>

        <JoinSession
          scenarios={scenarios}
          displayName={displayName}
          sessionCode={sessionCode}
          teamId={teamId}
          role={role}
          scenarioId={scenarioId}
          busy={busy}
          error={error}
          onDisplayNameChange={setDisplayName}
          onSessionCodeChange={setSessionCode}
          onTeamChange={setTeamId}
          onRoleChange={setRole}
          onScenarioChange={setScenarioId}
          onJoin={join}
          onCreate={createExercise}
        />
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>LIX SimOps</h1>
          <p>
            {scenarioName || "Exercise Session"} · {activeSessionCode} · {displayName} ·{" "}
            {role === "facilitator" ? "Facilitator" : `${teamId} / ${role}`}
          </p>
        </div>
        <div className="header-actions">
          <div className={connected ? "status good" : "status bad"}>
            {connected ? "Connected" : "Disconnected"}
          </div>
          <button onClick={leave}>Leave Session</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="clockbar">
        <strong>SIM TIME</strong>
        <span>{displayTime}</span>
        <span>{clock.running ? `▶ ${clock.speed}×` : "⏸ PAUSED"}</span>
      </section>

      {role === "facilitator" ? (
        <Facilitator
          sessionCode={activeSessionCode}
          scenarioName={scenarioName}
          participants={participants}
          events={events}
          schedule={schedule}
          onControl={sendControl}
          onInject={sendInject}
          onPartnerMessage={sendPartnerMessage}
          onScheduleControl={controlScheduledEvent}
        />
      ) : (
        <section className="workspace">
          {role === "radar" && <RadarOperator sessionCode={activeSessionCode} />}
          {role === "mesoanalyst" && <Mesoanalyst sessionCode={activeSessionCode} />}
          {role === "dss" && <DSS events={events} onRespond={sendDssResponse} />}
          <ExerciseFeed events={events} />
        </section>
      )}
    </main>
  );
}

export default App;

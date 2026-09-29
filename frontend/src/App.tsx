import { useEffect, useMemo, useRef, useState } from "react";

import { ExerciseFeed } from "./components/ExerciseFeed";
import { DSS } from "./pages/DSS";
import { Facilitator } from "./pages/Facilitator";
import { JoinSession } from "./pages/JoinSession";
import { Mesoanalyst } from "./pages/Mesoanalyst";
import { RadarOperator } from "./pages/RadarOperator";
import { createSession, listScenarios } from "./services/api";
import { createSimulationSocket } from "./services/socket";
import { formatSimDateTime } from "./utils/simTime";
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
  const [timezone, setTimezone] = useState("America/Chicago");
  const [facilitatorToken, setFacilitatorToken] = useState("");
  const [clock, setClock] = useState<ClockState>({
    sim_time: new Date().toISOString(),
    running: false,
    speed: 1,
  });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [events, setEvents] = useState<ExerciseEvent[]>([]);
  const [schedule, setSchedule] = useState<ScheduledExerciseItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
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

    let disposed = false;
    let retryTimer: number | undefined;
    const socket = createSimulationSocket({
      sessionCode: activeSessionCode,
      displayName,
      teamId,
      role,
      facilitatorToken: role === "facilitator" ? facilitatorToken : undefined,
    });
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnected(true);
      setReconnecting(false);
      setError("");
    });
    socket.addEventListener("close", (event) => {
      setConnected(false);
      if ([4400, 4403, 4404].includes(event.code)) {
        setReconnecting(false);
        return;
      }
      if (!disposed) {
        setReconnecting(true);
        retryTimer = window.setTimeout(
          () => setReconnectNonce((value) => value + 1),
          2000,
        );
      }
    });
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "session_state") {
        setClock({
          sim_time: msg.sim_time,
          running: msg.running,
          speed: msg.speed,
          scenario_end: msg.scenario_end,
        });
        setScenarioName(msg.scenario_name);
        setTimezone(msg.timezone ?? "America/Chicago");
        setParticipants(msg.participants ?? []);
        setSchedule(msg.schedule ?? []);
      } else if (msg.type === "clock") {
        setClock((current) => ({
          sim_time: msg.sim_time,
          running: msg.running,
          speed: msg.speed,
          scenario_end: msg.scenario_end ?? current.scenario_end,
        }));
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
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socketRef.current = null;
      socket.close();
    };
  }, [activeSessionCode, reconnectNonce]);

  const displayTime = useMemo(
    () => formatSimDateTime(clock.sim_time, timezone),
    [clock.sim_time, timezone],
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
    if (role === "facilitator" && !facilitatorToken.trim()) {
      setError("Enter the facilitator access key.");
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
      if (!created.facilitator_token) {
        throw new Error("Exercise server did not return a facilitator access key.");
      }
      setFacilitatorToken(created.facilitator_token);
      setRole("facilitator");
      setTeamId("FACILITATOR");
      setSessionCode(created.session_code);
      setScenarioName(created.scenario_name);
      setTimezone(created.timezone ?? "America/Chicago");
      setClock({
        sim_time: created.sim_time,
        running: created.running,
        speed: created.speed,
        scenario_end: created.scenario_end,
      });
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
    setReconnecting(false);
    setReconnectNonce(0);
    setParticipants([]);
    setEvents([]);
    setSchedule([]);
    setScenarioName("");
    setFacilitatorToken("");
    setError("");
    if (role === "facilitator") {
      setRole("radar");
      setTeamId("Team 1");
    }
  };

  const exerciseComplete = Boolean(
    clock.scenario_end
      && new Date(clock.sim_time).getTime() >= new Date(clock.scenario_end).getTime()
      && !clock.running,
  );

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
          facilitatorToken={facilitatorToken}
          busy={busy}
          error={error}
          onDisplayNameChange={setDisplayName}
          onSessionCodeChange={setSessionCode}
          onTeamChange={setTeamId}
          onRoleChange={setRole}
          onScenarioChange={setScenarioId}
          onFacilitatorTokenChange={setFacilitatorToken}
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
          {role === "facilitator" && facilitatorToken && (
            <details>
              <summary>Facilitator key</summary>
              <code>{facilitatorToken}</code>
            </details>
          )}
          <div className={connected ? "status good" : "status bad"}>
            {connected ? "Connected" : reconnecting ? "Reconnecting…" : "Disconnected"}
          </div>
          <button onClick={leave}>Leave Session</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="clockbar">
        <strong>SIM TIME</strong>
        <span>{displayTime}</span>
        <span>
          {exerciseComplete
            ? "■ EXERCISE COMPLETE"
            : clock.running
              ? `▶ ${clock.speed}×`
              : "⏸ PAUSED"}
        </span>
      </section>

      {role === "facilitator" ? (
        <Facilitator
          sessionCode={activeSessionCode}
          scenarioName={scenarioName}
          participants={participants}
          events={events}
          schedule={schedule}
          timezone={timezone}
          running={clock.running}
          speed={clock.speed}
          onControl={sendControl}
          onInject={sendInject}
          onPartnerMessage={sendPartnerMessage}
          onScheduleControl={controlScheduledEvent}
        />
      ) : (
        <section className="workspace">
          {role === "radar" && <RadarOperator sessionCode={activeSessionCode} timezone={timezone} />}
          {role === "mesoanalyst" && <Mesoanalyst sessionCode={activeSessionCode} timezone={timezone} />}
          {role === "dss" && <DSS sessionCode={activeSessionCode} timezone={timezone} events={events} onRespond={sendDssResponse} />}
          <ExerciseFeed events={events} timezone={timezone} />
        </section>
      )}
    </main>
  );
}

export default App;

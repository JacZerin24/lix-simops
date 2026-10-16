import { useEffect, useMemo, useRef, useState } from "react";

import { ExerciseFeed } from "./components/ExerciseFeed";
import { DSS } from "./pages/DSS";
import { Facilitator } from "./pages/Facilitator";
import { JoinSession } from "./pages/JoinSession";
import { Mesoanalyst } from "./pages/Mesoanalyst";
import { RadarOperator } from "./pages/RadarOperator";
import { createSession, listScenarios } from "./services/api";
import { createSimulationSocket } from "./services/socket";
import { formatExerciseDateTime } from "./utils/time";
import type {
  ClockState,
  ExerciseEvent,
  Participant,
  Role,
  ScenarioSummary,
  ScheduledExerciseItem,
  WarningRecord,
} from "./types/simulation";

type InjectDraft = {
  title: string;
  body: string;
  audience: string;
  target_team_id?: string;
};

type StormReportDraft = {
  title: string;
  body: string;
  audience: string;
  target_team_id?: string;
  report_kind: "tornado" | "hail" | "wind" | "report";
  lat: number;
  lon: number;
  magnitude?: string;
  source?: string;
  plot_on_radar: boolean;
  display_minutes: number;
};

const exerciseEventTypes = new Set([
  "inject",
  "partner_message",
  "dss_response",
  "team_message",
  "storm_report",
  "meso_update",
  "shift_log_update",
  "warning_route_notice",
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
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");
  const [connectionDetail, setConnectionDetail] = useState("");
  const [reconnectCount, setReconnectCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  // One identity per browser tab, reused through transient reconnects.
  // crypto.randomUUID() is secure-context-only and unavailable on most LAN
  // HTTP origins (http://192.168.x.x). getRandomValues works on those origins.
  const clientIdRef = useRef(
    Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  );

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
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempts = 0;
    let hadInterruption = false;
    const identity = {
      sessionCode: activeSessionCode,
      displayName,
      teamId,
      role,
      clientId: clientIdRef.current,
    };

    setConnected(false);
    setConnectionStatus("connecting");
    setConnectionDetail("");

    const connect = () => {
      if (disposed) return;
      let next: WebSocket;
      try {
        next = createSimulationSocket(identity);
      } catch (reason) {
        console.warn("SimOps WebSocket creation failed", reason);
        scheduleReconnect();
        return;
      }
      socket = next;
      socketRef.current = next;

      next.addEventListener("open", () => {
        if (disposed || socket !== next) return;
        const recovered = hadInterruption;
        attempts = 0;
        setConnected(true);
        setConnectionStatus("connected");
        setConnectionDetail(recovered ? "Connection restored; session state synchronized." : "");
        if (recovered) setReconnectCount((count) => count + 1);
        hadInterruption = false;
        setError("");
      });

      next.addEventListener("close", (event) => {
        if (disposed || socket !== next) return;
        socketRef.current = null;
        setConnected(false);
        console.warn("SimOps WebSocket closed", {
          code: event.code,
          reason: event.reason,
          clean: event.wasClean,
          session: activeSessionCode,
          team: teamId,
          role,
        });
        // Invalid/unknown sessions are not transient network interruptions.
        if (event.code === 4400 || event.code === 4404) {
          setConnectionStatus("offline");
          setConnectionDetail(`Connection rejected (${event.code}). Leave and rejoin a valid session.`);
          return;
        }
        hadInterruption = true;
        setConnectionDetail(`Connection interrupted (code ${event.code}${event.reason ? `: ${event.reason}` : ""}).`);
        scheduleReconnect();
      });

      next.addEventListener("error", () => {
        if (!disposed && socket === next) {
          console.warn("SimOps WebSocket transport error", { session: activeSessionCode, team: teamId, role });
        }
      });

      next.addEventListener("message", (event) => {
        if (disposed || socket !== next) return;
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch (reason) {
          console.warn("SimOps received an invalid WebSocket message", reason);
          return;
        }

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
        } else if (msg.type === "warning_state") {
          setWarnings(msg.warnings ?? []);
        } else if (exerciseEventTypes.has(msg.type)) {
          // De-duplicate a racing live event and reconnect snapshot by event ID.
          setEvents((current) => msg.event_id && current.some((entry) => entry.event_id === msg.event_id)
            ? current
            : [...current, msg as ExerciseEvent]);
        } else if (msg.type === "error") {
          setError(msg.message ?? "Exercise server error");
        }
      });
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer !== null) return;
      attempts += 1;
      const delay = Math.min(1000 * 2 ** Math.min(attempts - 1, 4), 15000);
      setConnectionStatus("reconnecting");
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      socketRef.current = null;
      socket?.close(1000, "Left session");
    };
  }, [activeSessionCode]);
  const displayTime = useMemo(
    () => formatExerciseDateTime(clock.sim_time),
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
    setWarnings([]);
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
      setWarnings([]);
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
    setConnectionStatus("connecting");
    setConnectionDetail("");
    setReconnectCount(0);
    setParticipants([]);
    setEvents([]);
    setSchedule([]);
    setWarnings([]);
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

  const sendShiftLogUpdate = () => {
    send({ type: "shift_log_update" });
  };

  const sendMesoUpdate = (draft: {
    body: string;
    category: string;
    product_id: string;
    product_label: string;
    frame_time: string;
  }) => {
    send({ type: "meso_update", ...draft });
  };

  const sendStormReport = (draft: StormReportDraft) => {
    send({
      type: "storm_report",
      ...draft,
    });
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
          <div
            className={connected ? "status good" : "status bad"}
            title={connectionDetail || undefined}
            role="status"
            aria-live="polite"
          >
            {connectionStatus === "connected"
              ? `Connected${reconnectCount ? ` · recovered ${reconnectCount}×` : ""}`
              : connectionStatus === "reconnecting"
                ? "Reconnecting…"
                : connectionStatus === "offline"
                  ? "Connection rejected"
                  : "Connecting…"}
          </div>
          <button onClick={leave}>Leave Session</button>
        </div>
      </header>

      {connectionStatus !== "connected" && (
        <div className="error-banner">
          {connectionDetail || "Establishing the exercise connection."}
          {connectionStatus === "reconnecting" ? " Retrying automatically; do not leave the session." : ""}
        </div>
      )}
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
          warnings={warnings}
          onControl={sendControl}
          onInject={sendInject}
          onPartnerMessage={sendPartnerMessage}
          onStormReport={sendStormReport}
          onScheduleControl={controlScheduledEvent}
        />
      ) : (
        <section className="workspace">
          {role === "radar" && (
            <RadarOperator
              sessionCode={activeSessionCode}
              warnings={warnings}
              events={events}
              onWarningAction={send}
            />
          )}
          {role === "mesoanalyst" && (
            <Mesoanalyst sessionCode={activeSessionCode} onUpdate={sendMesoUpdate} />
          )}
          {role === "dss" && (
            <DSS
              sessionCode={activeSessionCode}
              events={events}
              warnings={warnings}
              onRespond={sendDssResponse}
              onShiftLogUpdated={sendShiftLogUpdate}
            />
          )}
          <ExerciseFeed events={events} />
        </section>
      )}
    </main>
  );
}

export default App;

import type { Role, ScenarioSummary } from "../../types/simulation";

type Props = {
  scenarios: ScenarioSummary[];
  displayName: string;
  sessionCode: string;
  teamId: string;
  role: Role;
  scenarioId: string;
  facilitatorToken: string;
  busy: boolean;
  error: string;
  onDisplayNameChange: (value: string) => void;
  onSessionCodeChange: (value: string) => void;
  onTeamChange: (value: string) => void;
  onRoleChange: (value: Role) => void;
  onScenarioChange: (value: string) => void;
  onFacilitatorTokenChange: (value: string) => void;
  onJoin: () => void;
  onCreate: () => void;
};

export function JoinSession({
  scenarios,
  displayName,
  sessionCode,
  teamId,
  role,
  scenarioId,
  facilitatorToken,
  busy,
  error,
  onDisplayNameChange,
  onSessionCodeChange,
  onTeamChange,
  onRoleChange,
  onScenarioChange,
  onFacilitatorTokenChange,
  onJoin,
  onCreate,
}: Props) {
  return (
    <section className="lobby-grid">
      <div className="panel">
        <h2>Join Exercise</h2>
        <p className="muted">
          Enter the session code from exercise control, then select your assigned team and role.
        </p>

        <div className="form-grid">
          <label>
            Your name
            <input
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="First name or call sign"
            />
          </label>

          <label>
            Session code
            <input
              value={sessionCode}
              onChange={(e) => onSessionCodeChange(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
            />
          </label>

          <label>
            Team
            <select
              value={teamId}
              onChange={(e) => onTeamChange(e.target.value)}
              disabled={role === "facilitator"}
            >
              <option>Team 1</option>
              <option>Team 2</option>
              <option>Team 3</option>
              <option>Team 4</option>
            </select>
          </label>

          <label>
            Role
            <select value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>
              <option value="radar">Radar Operator</option>
              <option value="mesoanalyst">Mesoanalyst</option>
              <option value="dss">DSS Meteorologist</option>
              <option value="facilitator">Facilitator</option>
            </select>
          </label>

          {role === "facilitator" && (
            <label>
              Facilitator access key
              <input
                value={facilitatorToken}
                onChange={(e) => onFacilitatorTokenChange(e.target.value)}
                placeholder="Private key from exercise control"
                autoComplete="off"
              />
            </label>
          )}
        </div>

        <button className="primary-action" onClick={onJoin} disabled={busy}>
          Join Session
        </button>
      </div>

      <div className="panel">
        <h2>Create Exercise</h2>
        <p className="muted">
          Facilitators can create a synchronized session and share the generated code with participants.
        </p>

        <div className="form-grid">
          <label>
            Facilitator name
            <input
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Your name"
            />
          </label>

          <label>
            Scenario
            <select value={scenarioId} onChange={(e) => onScenarioChange(e.target.value)}>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          className="primary-action"
          onClick={onCreate}
          disabled={busy || scenarios.length === 0}
        >
          {busy ? "Working…" : "Create Session"}
        </button>

        {error && <p className="error-text">{error}</p>}
      </div>
    </section>
  );
}

import type { ScenarioSummary, SessionState } from "../types/simulation";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const response = await fetch(`${API_BASE}/api/scenarios`);
  if (!response.ok) throw new Error("Unable to load scenarios");
  return response.json();
}

export async function createSession(scenarioId: string): Promise<SessionState> {
  const response = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Unable to create session");
  }
  return response.json();
}

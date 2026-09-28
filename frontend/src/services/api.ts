import type { EventOperationsConfig, MesoFrameResponse, RadarFrameResponse, ScenarioSummary, SessionState } from "../types/simulation";

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


export async function getRadarFrames(
  sessionCode: string,
  product: string,
  elevation: number,
): Promise<RadarFrameResponse> {
  const params = new URLSearchParams({
    product,
    elevation: String(elevation),
  });
  const response = await fetch(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/radar/frames?${params.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load radar frames");
  const payload: RadarFrameResponse = await response.json();
  return {
    ...payload,
    frames: payload.frames.map((frame) => ({
      ...frame,
      asset_url: frame.asset_url.startsWith("http")
        ? frame.asset_url
        : `${API_BASE}${frame.asset_url}`,
    })),
  };
}


export async function getMesoFrames(
  sessionCode: string,
  product: string,
): Promise<MesoFrameResponse> {
  const params = new URLSearchParams();
  if (product) params.set("product", product);
  const response = await fetch(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/meso/frames?${params.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load mesoanalysis products");
  const payload: MesoFrameResponse = await response.json();
  return {
    ...payload,
    frames: payload.frames.map((frame) => ({
      ...frame,
      asset_url: frame.asset_url.startsWith("http")
        ? frame.asset_url
        : `${API_BASE}${frame.asset_url}`,
    })),
  };
}


export async function getEventOperations(
  sessionCode: string,
): Promise<EventOperationsConfig> {
  const response = await fetch(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionCode)}/event`,
  );
  if (!response.ok) throw new Error("Unable to load event operations");
  return response.json();
}

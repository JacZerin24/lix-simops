export function createSimulationSocket(): WebSocket {
  const base = import.meta.env.VITE_WS_BASE ?? "ws://localhost:8000";
  return new WebSocket(`${base}/ws`);
}

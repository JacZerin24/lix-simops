import type { Role } from "../types/simulation";

type SocketOptions = {
  sessionCode: string;
  displayName: string;
  teamId: string;
  role: Role;
  facilitatorToken?: string;
};

export function createSimulationSocket(options: SocketOptions): WebSocket {
  const defaultBase = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
  const base = import.meta.env.VITE_WS_BASE || defaultBase;
  const params = new URLSearchParams({
    display_name: options.displayName,
    team_id: options.teamId,
    role: options.role,
  });
  if (options.facilitatorToken) {
    params.set("facilitator_token", options.facilitatorToken);
  }
  return new WebSocket(
    `${base}/ws/${encodeURIComponent(options.sessionCode)}?${params.toString()}`,
  );
}

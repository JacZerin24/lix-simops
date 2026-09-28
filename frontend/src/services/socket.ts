import type { Role } from "../types/simulation";

type SocketOptions = {
  sessionCode: string;
  displayName: string;
  teamId: string;
  role: Role;
};

export function createSimulationSocket(options: SocketOptions): WebSocket {
  const base = import.meta.env.VITE_WS_BASE ?? "ws://localhost:8000";
  const params = new URLSearchParams({
    display_name: options.displayName,
    team_id: options.teamId,
    role: options.role,
  });
  return new WebSocket(
    `${base}/ws/${encodeURIComponent(options.sessionCode)}?${params.toString()}`,
  );
}

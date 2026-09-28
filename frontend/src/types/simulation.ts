export type Role = "radar" | "mesoanalyst" | "dss" | "facilitator";

export type ClockState = {
  sim_time: string;
  running: boolean;
  speed: number;
};

export type Participant = {
  id: string;
  display_name: string;
  team_id: string;
  role: Role;
};

export type ScenarioSummary = {
  id: string;
  name: string;
};

export type SessionState = ClockState & {
  session_code: string;
  scenario_id: string;
  scenario_name: string;
  participants: Participant[];
};

export type ExerciseEvent = {
  type: "inject" | "partner_message" | "dss_response" | "team_message";
  event_id?: string;
  title?: string;
  body: string;
  audience?: string;
  target_team_id?: string | null;
  team_id?: string;
  sender?: string;
  role?: Role;
  sim_time?: string;
};

export type Inject = ExerciseEvent;

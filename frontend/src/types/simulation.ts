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

export type ScheduledExerciseItem = {
  id: string;
  at_sim_time: string;
  kind: "inject" | "partner_message";
  title: string;
  body: string;
  audience: string;
  target_team_id?: string | null;
  sender: string;
  due_at?: string | null;
  status: "pending" | "released" | "skipped";
};

export type SessionState = ClockState & {
  session_code: string;
  scenario_id: string;
  scenario_name: string;
  participants: Participant[];
  schedule?: ScheduledExerciseItem[];
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


export type RadarProductSummary = {
  id: string;
  label: string;
  units: string;
};

export type RadarFrame = {
  timestamp: string;
  product: string;
  elevation: number;
  asset_url: string;
  source_key?: string | null;
};

export type RadarFrameResponse = {
  available: boolean;
  scenario_id: string;
  sim_time: string;
  radar_site: string | null;
  range_km?: number;
  products: RadarProductSummary[];
  elevations: number[];
  selected_product: string;
  selected_elevation: number;
  frames: RadarFrame[];
};


export type MesoProductSummary = {
  id: string;
  label: string;
  category: string;
  units: string;
  description: string;
  kind: string;
};

export type MesoFrame = {
  timestamp: string;
  product: string;
  asset_url: string;
  source_key?: string | null;
};

export type MesoFrameResponse = {
  available: boolean;
  scenario_id: string;
  sim_time: string;
  categories: string[];
  products: MesoProductSummary[];
  selected_product: string;
  frames: MesoFrame[];
};

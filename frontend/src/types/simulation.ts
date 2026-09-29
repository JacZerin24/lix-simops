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
  vmin?: number | null;
  vmax?: number | null;
  cmap?: string | null;
  palette?: string[];
};

export type RadarGridMetadata = {
  azimuth_bins: number;
  range_bins: number;
  range_start_m: number;
  range_step_m: number;
  value_min: number;
  value_max: number;
  nodata: number;
  actual_elevation?: number | null;
};

export type RadarFrame = {
  timestamp: string;
  product: string;
  elevation: number;
  asset_url: string;
  source_key?: string | null;
  data_url?: string | null;
  grid?: RadarGridMetadata | null;
};

export type RadarFrameResponse = {
  available: boolean;
  scenario_id: string;
  sim_time: string;
  radar_site: string | null;
  radar_latitude?: number | null;
  radar_longitude?: number | null;
  radar_altitude_m?: number | null;
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


export type DecisionThreshold = {
  id: string;
  hazard: string;
  threshold: string;
  action: string;
  basis: string;
  exercise_note?: string;
};

export type EventOperationsConfig = {
  event?: {
    name?: string;
    type?: string;
    event_date?: string;
    scheduled_start_local?: string;
    timezone?: string;
    primary_operational_area?: string;
    crowd_note?: string;
    pre_parade?: {
      name?: string;
      location?: string;
      planning_note?: string;
    };
    route?: string[];
    route_end?: string;
  };
  partner?: {
    organization?: string;
    primary_contact_role?: string;
    assumption_note?: string;
    partner_priorities?: string[];
  };
  communications?: {
    mock_shift_log?: {
      owner?: string;
      implementation?: string;
      form_url?: string | null;
      participant_role?: string;
      required_use?: string;
      recommended_fields?: string[];
      note?: string;
    };
  };
  operations?: {
    exercise_duration_minutes?: number;
    simulation_strategy?: string;
    first_aid_reference?: {
      basis_year?: number;
      note?: string;
      locations?: string[];
    };
    decision_thresholds?: DecisionThreshold[];
  };
};

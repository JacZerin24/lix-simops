export type Role = "radar" | "mesoanalyst" | "dss" | "facilitator";

export type ClockState = {
  sim_time: string;
  running: boolean;
  speed: number;
};

export type Inject = {
  title: string;
  body: string;
  audience?: string;
};

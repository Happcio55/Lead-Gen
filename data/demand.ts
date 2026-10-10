export type Workload = {
  name: string;
  description: string;
  openJobs: number;
  /** Average paid rate for this workload, USD per GPU-hour. */
  rate: number;
  /** Share of queued work that is still waiting for a machine, 0–100. */
  demand: number;
};

export const queuedValue = 48210;

export const workloads: Workload[] = [
  { name: "Agent sessions", description: "Long-running browser and research agents", openJobs: 1842, rate: 0.31, demand: 92 },
  { name: "Batch inference", description: "Offline model runs over large datasets", openJobs: 1306, rate: 0.36, demand: 84 },
  { name: "Test & CI runners", description: "Build and test suites for software teams", openJobs: 977, rate: 0.12, demand: 71 },
  { name: "3D rendering", description: "Frame and scene rendering for studios", openJobs: 512, rate: 0.29, demand: 58 },
  { name: "Video transcoding", description: "Encoding pipelines for media platforms", openJobs: 438, rate: 0.14, demand: 43 },
  { name: "Scientific compute", description: "Simulation and protein folding batches", openJobs: 201, rate: 0.22, demand: 27 },
];

export type Workload = {
  name: string;
  description: string;
  /** Machines working this kind of job right now. */
  machines: number;
  /** Average paid rate, USD per hour, after fee. */
  rate: number;
};

export const workloads: Workload[] = [
  { name: "AI agent sessions", description: "Browser and research agents for software companies", machines: 4120, rate: 0.31 },
  { name: "Batch inference", description: "Running trained models over big datasets", machines: 2874, rate: 0.36 },
  { name: "3D rendering", description: "Frames for animation and architecture studios", machines: 1302, rate: 0.29 },
  { name: "Test runners", description: "Build and test suites for dev teams", machines: 2231, rate: 0.12 },
  { name: "Video encoding", description: "Transcoding for streaming platforms", machines: 1018, rate: 0.14 },
  { name: "Science", description: "Protein folding and climate simulation batches", machines: 547, rate: 0.22 },
];

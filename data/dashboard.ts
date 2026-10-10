export const kpis = [
  { label: "Earned this month", value: 58.42, prefix: "$", decimals: 2, delta: "+12.4%" },
  { label: "Hours worked", value: 214, prefix: "", decimals: 0, delta: "+18 h" },
  { label: "Jobs completed", value: 1386, prefix: "", decimals: 0, delta: "+9.1%" },
  { label: "Resume time p50 / p95", value: 0, prefix: "", decimals: 0, delta: "", text: "0.4 s / 0.9 s" },
] as const;

/** Net earnings per day, last 14 days, USD. */
export const earningsByDay = [1.62, 2.31, 2.08, 2.74, 1.15, 0.92, 2.88, 2.41, 2.97, 3.12, 2.66, 1.38, 1.07, 3.24];

export const jobBreakdown = [
  { name: "Agent sessions", share: 41, amount: 23.95 },
  { name: "Batch inference", share: 33, amount: 19.28 },
  { name: "3D rendering", share: 15, amount: 8.76 },
  { name: "Test & CI runners", share: 11, amount: 6.43 },
];

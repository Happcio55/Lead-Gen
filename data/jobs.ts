export type DemoStep = {
  id: string;
  label: string;
  time: string;
  log: string[];
};

export const demoSteps: DemoStep[] = [
  {
    id: "away",
    label: "You leave",
    time: "23:04:12",
    log: [
      "23:04:12  screen locked",
      "23:04:12  rule matched: screen_locked",
      "23:04:13  health check  gpu 41 °C · 18 W · driver ok",
      "23:04:13  status → available",
    ],
  },
  {
    id: "match",
    label: "A job is matched",
    time: "23:04:15",
    log: [
      "23:04:15  offer  agent-session · 24 GB · est. 3h 10m",
      "23:04:15  rate   $0.31 / hr (after fee)",
      "23:04:15  customer verified  ✓ business · ✓ signed image",
      "23:04:16  accepted",
    ],
  },
  {
    id: "sandbox",
    label: "It runs sealed",
    time: "23:04:19",
    log: [
      "23:04:17  pulling image  sha256:9f2c…e81a",
      "23:04:18  sandbox  no host fs · no LAN · egress allowlist (2 hosts)",
      "23:04:18  scratch volume  encrypted · 40 GB",
      "23:04:19  running  gpu cap 80% · temp cap 78 °C",
    ],
  },
  {
    id: "return",
    label: "You come back",
    time: "07:12:40",
    log: [
      "07:12:40  input detected",
      "07:12:40  checkpoint saved · job paused",
      "07:12:41  gpu released in 0.42 s",
      "07:12:41  scratch volume wiped",
    ],
  },
  {
    id: "paid",
    label: "You get paid",
    time: "07:12:41",
    log: [
      "07:12:41  session  8h 08m active",
      "07:12:41  credited  +$2.52",
      "07:12:41  week to date  $14.87",
      "07:12:41  next payout  Monday",
    ],
  },
];

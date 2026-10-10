export type Platform = {
  id: string;
  label: string;
  install: string;
  config: string;
};

const config = `# ~/.idleagents/config.toml
[schedule]
# start_when: "screen_locked", "idle:10m" or "23:00-07:00"
start_when = "screen_locked"

[limits]
gpu_power   = 0.80
max_temp_c  = 78
on_battery  = false

[payout]
method = "bank"`;

export const platforms: Platform[] = [
  {
    id: "windows",
    label: "Windows",
    install: `winget install IdleAgents.Client\nidleagents login`,
    config,
  },
  {
    id: "macos",
    label: "macOS",
    install: `brew install --cask idleagents\nidleagents login`,
    config,
  },
  {
    id: "linux",
    label: "Linux",
    install: `curl -fsSL https://get.idleagents.com | sh\nidleagents login`,
    config,
  },
];

export type Vendor = "NVIDIA" | "AMD" | "Apple" | "Intel";
export type Demand = "High" | "Medium" | "Low";

export type Hardware = {
  id: string;
  name: string;
  vendor: Vendor;
  kind: "GPU" | "CPU" | "SoC";
  memory: string;
  /** Average payout per active hour, USD, after platform fee. */
  ratePerHour: number;
  /** Typical full-load power draw of the device, watts. */
  watts: number;
  demand: Demand;
};

export const hardware: Hardware[] = [
  { id: "rtx-5090", name: "GeForce RTX 5090", vendor: "NVIDIA", kind: "GPU", memory: "32 GB", ratePerHour: 0.52, watts: 575, demand: "High" },
  { id: "rtx-4090", name: "GeForce RTX 4090", vendor: "NVIDIA", kind: "GPU", memory: "24 GB", ratePerHour: 0.38, watts: 450, demand: "High" },
  { id: "rtx-3090", name: "GeForce RTX 3090", vendor: "NVIDIA", kind: "GPU", memory: "24 GB", ratePerHour: 0.26, watts: 350, demand: "High" },
  { id: "rtx-4080s", name: "GeForce RTX 4080 Super", vendor: "NVIDIA", kind: "GPU", memory: "16 GB", ratePerHour: 0.27, watts: 320, demand: "High" },
  { id: "rtx-4070ti", name: "GeForce RTX 4070 Ti", vendor: "NVIDIA", kind: "GPU", memory: "12 GB", ratePerHour: 0.19, watts: 285, demand: "Medium" },
  { id: "rtx-3080", name: "GeForce RTX 3080", vendor: "NVIDIA", kind: "GPU", memory: "10 GB", ratePerHour: 0.17, watts: 320, demand: "Medium" },
  { id: "rtx-4070", name: "GeForce RTX 4070", vendor: "NVIDIA", kind: "GPU", memory: "12 GB", ratePerHour: 0.15, watts: 200, demand: "Medium" },
  { id: "rtx-4060ti", name: "GeForce RTX 4060 Ti", vendor: "NVIDIA", kind: "GPU", memory: "16 GB", ratePerHour: 0.11, watts: 165, demand: "Medium" },
  { id: "rtx-3060", name: "GeForce RTX 3060", vendor: "NVIDIA", kind: "GPU", memory: "12 GB", ratePerHour: 0.08, watts: 170, demand: "Low" },
  { id: "rx-7900xtx", name: "Radeon RX 7900 XTX", vendor: "AMD", kind: "GPU", memory: "24 GB", ratePerHour: 0.21, watts: 355, demand: "Medium" },
  { id: "rx-7800xt", name: "Radeon RX 7800 XT", vendor: "AMD", kind: "GPU", memory: "16 GB", ratePerHour: 0.12, watts: 263, demand: "Low" },
  { id: "m3-max", name: "M3 Max", vendor: "Apple", kind: "SoC", memory: "36–128 GB", ratePerHour: 0.16, watts: 90, demand: "High" },
  { id: "m2-pro", name: "M2 Pro", vendor: "Apple", kind: "SoC", memory: "16–32 GB", ratePerHour: 0.09, watts: 55, demand: "Medium" },
  { id: "m1", name: "M1", vendor: "Apple", kind: "SoC", memory: "8–16 GB", ratePerHour: 0.04, watts: 30, demand: "Low" },
  { id: "r9-7950x", name: "Ryzen 9 7950X", vendor: "AMD", kind: "CPU", memory: "16 cores", ratePerHour: 0.07, watts: 170, demand: "Medium" },
  { id: "i9-14900k", name: "Core i9-14900K", vendor: "Intel", kind: "CPU", memory: "24 cores", ratePerHour: 0.07, watts: 253, demand: "Medium" },
  { id: "r7-5800x", name: "Ryzen 7 5800X", vendor: "AMD", kind: "CPU", memory: "8 cores", ratePerHour: 0.04, watts: 105, demand: "Low" },
];

export const DAYS_PER_MONTH = 30;

export function monthlyGross(h: Hardware, hoursPerDay: number) {
  return h.ratePerHour * hoursPerDay * DAYS_PER_MONTH;
}

export function monthlyPowerCost(h: Hardware, hoursPerDay: number, pricePerKwh: number) {
  return (h.watts / 1000) * hoursPerDay * DAYS_PER_MONTH * pricePerKwh;
}

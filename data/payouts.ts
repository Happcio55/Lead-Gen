export type Payout = {
  id: number;
  device: string;
  city: string;
  hours: number;
  amount: number;
  /** Seconds since the payout was sent. */
  age: number;
};

export const initialPayouts: Payout[] = [
  { id: 1, device: "RTX 4080 Super", city: "Rotterdam", hours: 61.2, amount: 16.52, age: 8 },
  { id: 2, device: "M3 Max", city: "Austin", hours: 48.0, amount: 7.68, age: 31 },
  { id: 3, device: "RTX 4090", city: "Copenhagen", hours: 72.5, amount: 27.55, age: 54 },
  { id: 4, device: "RX 7900 XTX", city: "Kraków", hours: 39.8, amount: 8.36, age: 97 },
  { id: 5, device: "RTX 3080", city: "Lisbon", hours: 55.1, amount: 9.37, age: 140 },
  { id: 6, device: "Ryzen 9 7950X", city: "Toronto", hours: 80.3, amount: 5.62, age: 188 },
  { id: 7, device: "RTX 3090", city: "Seoul", hours: 66.0, amount: 17.16, age: 236 },
];

const devices: [string, number][] = [
  ["RTX 4090", 0.38],
  ["RTX 5090", 0.52],
  ["RTX 3090", 0.26],
  ["RTX 4070", 0.15],
  ["M2 Pro", 0.09],
  ["RTX 4060 Ti", 0.11],
  ["Core i9-14900K", 0.07],
  ["RX 7800 XT", 0.12],
];
const cities = ["Berlin", "Oslo", "Denver", "Madrid", "Melbourne", "Dublin", "Prague", "São Paulo", "Helsinki", "Chicago", "Aarhus", "Lyon"];

/** Builds a plausible payout row. Only call on the client. */
export function randomPayout(id: number): Payout {
  const [device, rate] = devices[Math.floor(Math.random() * devices.length)];
  const hours = Math.round((20 + Math.random() * 70) * 10) / 10;
  return {
    id,
    device,
    city: cities[Math.floor(Math.random() * cities.length)],
    hours,
    amount: Math.round(hours * rate * 100) / 100,
    age: 0,
  };
}

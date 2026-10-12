// Tiny global store (useSyncExternalStore) for client state that persists in localStorage.
import { useSyncExternalStore } from 'react';
import { ACCENT } from '@brand-meta';
import { load, save } from './lib.js';

const DEFAULT_FILTERS = { minLiq: 0, minMc: 0, maxMc: 0, minTx5m: 0, maxAgeMin: 0, hideHooks: false };

export const DEFAULT_SETTINGS = {
  quickBuy: 0.005, // ETH per one-click buy
  presets: [0.002, 0.005, 0.01, 0.05],
  slippage: 15, // percent
  accent: ACCENT,
  compact: false,
  pauseOnHover: true,
  sound: false,
  filters: { new: { ...DEFAULT_FILTERS }, hot: { ...DEFAULT_FILTERS }, est: { ...DEFAULT_FILTERS, minLiq: 2000 } },
  // Per-column quick buy: amount in ETH and the trade preset (P1–P3) it uses.
  laneBuy: { new: 0.005, hot: 0.005, est: 0.005 },
  laneP: { new: 0, hot: 0, est: 0 },
  // Trade presets: slippage per profile (P1 careful … P3 aggressive).
  tradePresets: [{ slippage: 15 }, { slippage: 25 }, { slippage: 40 }],
};

const state = {
  settings: { ...DEFAULT_SETTINGS, ...load('settings', {}) },
  watchlist: load('watchlist', []), // pool ids
  // Per wallet address: { [token]: Position }
  positions: load('positions', {}),
  // Per wallet address: { [token]: Rule }
  rules: load('rules', {}),
  trades: load('trades', []), // recent trade log (all wallets)
  toasts: [],
  view: load('view', 'home'), // home | terminal | portfolio
  drawer: null, // pool id
  palette: false,
};
state.settings.filters = { ...DEFAULT_SETTINGS.filters, ...state.settings.filters };
// Visitors who saved the other brand's default accent get this brand's default, once.
const OTHER_DEFAULT = ACCENT === 'orange' ? 'lime' : 'orange';
if (!load(`look:${ACCENT}`, false)) {
  if (state.settings.accent === OTHER_DEFAULT) state.settings.accent = ACCENT;
  save(`look:${ACCENT}`, true);
}
state.settings.laneBuy = { ...DEFAULT_SETTINGS.laneBuy, ...state.settings.laneBuy };
state.settings.laneP = { ...DEFAULT_SETTINGS.laneP, ...state.settings.laneP };

const listeners = new Set();
const PERSIST = ['settings', 'watchlist', 'positions', 'rules', 'trades', 'view'];

export function getState() {
  return state;
}

export function set(patch) {
  for (const [k, v] of Object.entries(patch)) {
    state[k] = typeof v === 'function' ? v(state[k]) : v;
    if (PERSIST.includes(k)) save(k, state[k]);
  }
  for (const l of listeners) l();
}

export function useStore(selector) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state)
  );
}

export function setSettings(patch) {
  set({ settings: (s) => ({ ...s, ...patch }) });
}

export function setFilter(lane, patch) {
  set({ settings: (s) => ({ ...s, filters: { ...s.filters, [lane]: { ...s.filters[lane], ...patch } } }) });
}

export function setLaneBuy(lane, patch) {
  set({
    settings: (s) => ({
      ...s,
      laneBuy: 'amount' in patch ? { ...s.laneBuy, [lane]: patch.amount } : s.laneBuy,
      laneP: 'p' in patch ? { ...s.laneP, [lane]: patch.p } : s.laneP,
    }),
  });
}

export function resetFilters(lane) {
  setFilter(lane, DEFAULT_SETTINGS.filters[lane]);
}

export function toggleWatch(id) {
  set({ watchlist: (w) => (w.includes(id) ? w.filter((x) => x !== id) : [id, ...w]) });
}

let toastId = 0;
export function toast(msg, { kind = 'info', link, ttl = 5000 } = {}) {
  const id = ++toastId;
  set({ toasts: (t) => [...t.slice(-4), { id, msg, kind, link }] });
  if (ttl) setTimeout(() => dismiss(id), ttl);
  return id;
}

export function updateToast(id, patch, ttl = 6000) {
  set({ toasts: (t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  if (ttl) setTimeout(() => dismiss(id), ttl);
}

export function dismiss(id) {
  set({ toasts: (t) => t.filter((x) => x.id !== id) });
}

export const openDrawer = (id) => set({ drawer: id });
export const setView = (view) => set({ view, drawer: null });
export const closeDrawer = () => set({ drawer: null });

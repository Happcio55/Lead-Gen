import { useSyncExternalStore, useRef } from 'react'

// Minimal external store: get / set / subscribe, used with useStore(store, selector).
export function createStore(initial) {
  let state = initial
  const subs = new Set()
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch }
      if (next === state) return
      state = next
      subs.forEach((fn) => fn())
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export function useStore(store, selector = (s) => s) {
  const sel = useRef(selector)
  sel.current = selector
  return useSyncExternalStore(store.subscribe, () => sel.current(store.get()))
}

export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) : fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage blocked: the session still works, it just won't persist */
    }
  },
}

// Live data hooks: board polling, pool detail polling and the wallet's ETH balance.
import { useEffect, useMemo, useState } from 'react';
import { chainClient } from './lib.js';

export function useBoard() {
  const [state, setState] = useState({ rows: [], feed: [], meta: null, status: 'connecting' });
  useEffect(() => {
    // Polling (not SSE) so the same client works against serverless hosting with a CDN in front.
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        // A hung request must not freeze the board: give up and poll again.
        const res = await fetch('/api/board', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        const body = await res.json();
        if (stop) return;
        if (res.status === 503 || body.syncing) setState((s) => ({ ...s, meta: body.meta, status: 'syncing' }));
        else if (res.ok) setState({ rows: body.rows, meta: body.meta, feed: body.feed || [], status: 'live' });
        else setState((s) => ({ ...s, status: 'reconnecting' }));
      } catch {
        if (!stop) setState((s) => ({ ...s, status: 'reconnecting' }));
      }
      // Slow down while the tab is hidden.
      if (!stop) timer = setTimeout(tick, document.hidden ? 10_000 : 2000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  const byId = useMemo(() => new Map(state.rows.map((r) => [r.id, r])), [state.rows]);
  // Several pools can share a token; the most active one represents it.
  const byToken = useMemo(() => {
    const m = new Map();
    for (const r of state.rows) {
      const cur = m.get(r.token);
      if (!cur || r.vol1hUsd > cur.vol1hUsd) m.set(r.token, r);
    }
    return m;
  }, [state.rows]);
  return { ...state, byId, byToken };
}

export function usePoolDetail(id, bucketMs) {
  const [detail, setDetail] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!id) return;
    let stop = false;
    setDetail(null);
    setMissing(false);
    const load = async () => {
      try {
        const res = await fetch(`/api/pool/${id}?bucket=${bucketMs}`, { signal: AbortSignal.timeout(8000) });
        if (res.status === 404) return !stop && setMissing(true);
        const d = await res.json();
        if (!stop) setDetail(d);
      } catch {
        // keep last detail
      }
    };
    load();
    const iv = setInterval(load, 2000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [id, bucketMs]);
  return { detail, missing };
}

export function useEthBalance(address) {
  const [bal, setBal] = useState(null);
  useEffect(() => {
    if (!address) return setBal(null);
    let stop = false;
    const load = () =>
      chainClient
        .getBalance({ address })
        .then((b) => !stop && setBal(Number(b) / 1e18))
        .catch(() => {});
    load();
    const iv = setInterval(load, 8000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [address]);
  return bal;
}

// Re-render every second so ages stay live between board pushes.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}

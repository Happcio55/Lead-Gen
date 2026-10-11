import { useEffect, useState } from 'react';
import { Board } from './Board.jsx';
import { useBoard, useNow } from './data.js';
import { Drawer } from './Drawer.jsx';
import { applyAccent, Holdings, Palette, Rail, Settings, TopBar } from './Shell.jsx';
import { getState, set, useStore } from './store.js';
import { useAutomation, useBalanceSync, useTrader } from './trading.js';
import { Toasts } from './ui.jsx';

export default function App() {
  const board = useBoard();
  const now = useNow();
  const drawer = useStore((s) => s.drawer);
  const palette = useStore((s) => s.palette);
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { buy } = useTrader();

  useBalanceSync();
  useAutomation(board.byToken, board.meta?.ethUsd || 0);

  useEffect(() => applyAccent(getState().settings.accent), []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        set({ palette: true });
      } else if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName)) {
        e.preventDefault();
        document.getElementById('board-filter')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <div className="bg-glow" aria-hidden />
      <TopBar meta={board.meta} status={board.status} onSearch={() => set({ palette: true })} onSettings={() => setSettingsOpen(true)} />
      <div className="layout">
        <Rail board={board} now={now} />
        <main className="main">
          <div className="main-bar">
            <div className="filter-input">
              <span>⌕</span>
              <input id="board-filter" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter the board…  ( / )" />
              {query && (
                <button className="icon-btn" onClick={() => setQuery('')}>
                  ✕
                </button>
              )}
            </div>
            <div className="legend">
              <span>
                Live Uniswap v4 ETH pools on Robinhood Chain · L = liquidity · V = 5m volume · TX = 5m trades
              </span>
            </div>
          </div>
          {board.status === 'connecting' || board.status === 'syncing' ? (
            <div className="syncing">
              <div className="pulse" />
              <b>Syncing with Robinhood Chain…</b>
              <span>Indexing the last hour of v4 pools and swaps. This takes a few seconds the first time.</span>
            </div>
          ) : (
            <Board rows={board.rows} now={now} query={query} onBuy={buy} />
          )}
          <Holdings board={board} />
        </main>
      </div>
      {drawer && <Drawer id={drawer} board={board} />}
      {drawer && <div className="drawer-scrim" onClick={() => set({ drawer: null })} />}
      {palette && <Palette rows={board.rows} onClose={() => set({ palette: false })} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      <Toasts />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Board } from './Board.jsx';
import { useBoard, useNow } from './data.js';
import { Drawer } from './Drawer.jsx';
import { Home } from './Home.jsx';
import { Portfolio } from './Portfolio.jsx';
import { applyAccent, Holdings, Palette, Rail, Settings, StatusBar, TopBar } from './Shell.jsx';
import { getState, set, useStore } from './store.js';
import { useAutomation, useBalanceSync, useTrader } from './trading.js';
import { Icon, Toasts } from './ui.jsx';
import { Rudy, RudyDefs } from './Rudy.jsx';

export default function App() {
  const board = useBoard();
  const now = useNow();
  const drawer = useStore((s) => s.drawer);
  const palette = useStore((s) => s.palette);
  const view = useStore((s) => s.view);
  const [panel, setPanel] = useState(null); // holdings | watch
  const togglePanel = (p) => setPanel((cur) => (cur === p ? null : p));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { buy } = useTrader();

  useBalanceSync();
  useAutomation(board.byToken, board.meta?.ethUsd || 0);

  useEffect(() => applyAccent(getState().settings.accent), []);

  // A coin page is a real page: the browser's back button returns to the list.
  useEffect(() => {
    if (!drawer) return;
    history.pushState({ coin: drawer }, '');
    document.querySelector('.scroll')?.scrollTo(0, 0);
    const onPop = () => set({ drawer: null });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [drawer]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        set({ palette: true });
      } else if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName)) {
        e.preventDefault();
        document.querySelector('.plane-search input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <RudyDefs />
      <div className="backdrop" aria-hidden>
        <span className="blob a" />
        <span className="blob b" />
        <span className="blob c" />
      </div>
      <TopBar meta={board.meta} status={board.status} onSearch={() => set({ palette: true })} onSettings={() => setSettingsOpen(true)} />
      {drawer && (
        <div className="scroll">
          <Drawer id={drawer} board={board} />
        </div>
      )}
      {!drawer && view === 'home' && (
        <div className="scroll">
          <Home board={board} now={now} />
        </div>
      )}
      {!drawer && view === 'portfolio' && (
        <div className="scroll">
          <Portfolio board={board} />
        </div>
      )}
      {!drawer && view === 'terminal' && (
        <main className="pulse">
          <div className="pulse-bar">
            <h1>
              Live <mark>launches</mark>
            </h1>
            <span className="chain-pill">
              <i /> Robinhood Chain
            </span>
            <span className="pulse-sub">New memecoins on Pons and Uniswap, updated every 2 seconds</span>
            <div className="pulse-actions">
              <button className={`bar-btn ${panel === 'watch' ? 'on' : ''}`} onClick={() => togglePanel('watch')}>
                <Icon name="star" /> Watchlist
              </button>
              <button className="bar-btn" onClick={() => setSettingsOpen(true)}>
                <Icon name="sliders" /> Display
              </button>
            </div>
          </div>
          {board.status === 'connecting' || board.status === 'syncing' ? (
            <div className="syncing">
              <Rudy mood="neutral" size={96} track />
              <b>Syncing with Robinhood Chain…</b>
              <span>Indexing the last hour of v4 pools and swaps. This takes a few seconds the first time.</span>
            </div>
          ) : (
            <Board rows={board.rows} now={now} onBuy={buy} />
          )}
        </main>
      )}
      {!drawer && view === 'terminal' && panel === 'holdings' && (
        <div className="float-panel wide">
          <Holdings board={board} />
        </div>
      )}
      {!drawer && view === 'terminal' && panel === 'watch' && (
        <div className="float-panel">
          <Rail board={board} now={now} />
        </div>
      )}
      {!drawer && view === 'terminal' && <StatusBar board={board} panel={panel} onToggle={togglePanel} />}
      {palette && <Palette rows={board.rows} onClose={() => set({ palette: false })} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      <Toasts />
    </div>
  );
}

// App chrome: top bar, account/watchlist rail, holdings dock, command palette and settings.
import { useEffect, useMemo, useRef, useState } from 'react';
import { addressUrl, txUrl } from '../../shared/chain.js';
import { useEthBalance } from './data.js';
import { age, copy, eth, num, pct, short, usd } from './lib.js';
import { openDrawer, set, setSettings, setView, toast, toggleWatch, useStore } from './store.js';
import { useTrader, valuePosition } from './trading.js';
import { Avatar, Delta, Modal, NumField, Spark, Toggle } from './ui.jsx';
import { useWallet } from './wallet.jsx';

export function TopBar({ meta, status, onSearch, onSettings }) {
  const wallet = useWallet();
  const quickBuy = useStore((s) => s.settings.quickBuy);
  const presets = useStore((s) => s.settings.presets);
  const view = useStore((s) => s.view);
  const lag = meta?.lag ?? 0;
  const health = status !== 'live' ? 'bad' : lag > 100 ? 'warn' : 'ok';
  return (
    <header className="topbar">
      <div className="brand" onClick={() => setView('home')}>
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
          <defs>
            <radialGradient id="orb" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#e9f9b8" />
              <stop offset="1" stopColor="#9fc21c" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="14" fill="url(#orb)" stroke="rgba(20,20,20,.12)" />
          <path d="M17.6 7 10 17.4h5.2l-1.4 7.6 8-10.6h-5.3z" fill="#141414" />
        </svg>
        <span>Gomo</span>
      </div>
      <nav className="tabs">
        {[
          ['home', 'Home'],
          ['terminal', 'Terminal'],
          ['portfolio', 'Portfolio'],
        ].map(([k, label]) => (
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </nav>

      <button className="search" onClick={onSearch}>
        <span>Search token, name or contract</span>
        <kbd>⌘K</kbd>
      </button>

      <div className={`quick ${view === 'terminal' ? '' : 'hide'}`}>
        <span>⚡ Quick buy</span>
        {presets.map((p) => (
          <button key={p} className={quickBuy === p ? 'on' : ''} onClick={() => setSettings({ quickBuy: p })}>
            {p}
          </button>
        ))}
        <span className="unit">ETH</span>
      </div>

      <div className="ticker">
        <span title="ETH / USD">
          <i>ETH</i> {usd(meta?.ethUsd, { compact: false })}
        </span>
        <span title="Gas price">
          <i>GAS</i> {meta ? `${meta.gasGwei} gwei` : '—'}
        </span>
        <span className={`health ${health}`} title={`Block ${meta?.head ?? '—'} · lag ${lag} blocks · ${meta?.pools ?? 0} pools`}>
          <b />
          {status === 'live' ? `${num(meta?.pools)} pools` : status}
        </span>
      </div>

      <button className="icon-btn" onClick={onSettings} title="Settings">
        ⚙
      </button>
      {wallet.authenticated ? (
        <AccountChip />
      ) : (
        <button className="cta login" onClick={() => wallet.login()} disabled={!wallet.ready}>
          {wallet.mode === 'privy' ? 'Log in' : 'Connect wallet'}
        </button>
      )}
    </header>
  );
}

function AccountChip() {
  const wallet = useWallet();
  const bal = useEthBalance(wallet.address);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="account" ref={ref}>
      <button className="account-btn" onClick={() => setOpen((v) => !v)}>
        <Avatar token={wallet.address} symbol={wallet.label || 'W'} logo={null} size={22} />
        <span className="mono">{bal == null ? '…' : eth(bal, 4)} ETH</span>
      </button>
      {open && (
        <div className="menu">
          <div className="menu-head">
            {wallet.label && <b>{wallet.label}</b>}
            <span className="mono">{short(wallet.address, 6)}</span>
            <small>{wallet.embedded ? 'Privy embedded wallet' : 'External wallet'}</small>
          </div>
          <button onClick={() => copy(wallet.address).then(() => toast('Address copied. Send ETH on Robinhood Chain to fund it.'))}>
            Copy deposit address
          </button>
          <a href="https://robinhood.com/chain" target="_blank" rel="noreferrer">
            Bridge ETH to Robinhood Chain ↗
          </a>
          <a href={addressUrl(wallet.address)} target="_blank" rel="noreferrer">
            View on explorer ↗
          </a>
          {wallet.exportKey && <button onClick={wallet.exportKey}>Export private key</button>}
          <button className="danger" onClick={wallet.logout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function Rail({ board, now }) {
  const watch = useStore((s) => s.watchlist);
  const trades = useStore((s) => s.trades);
  const rows = watch.map((id) => board.byId.get(id)).filter(Boolean);
  return (
    <aside className="rail">
      <section>
        <h3>
          Watchlist <span className="count">{rows.length}</span>
        </h3>
        {!watch.length && <p className="empty">Star a token (☆) to pin it here.</p>}
        {rows.map((r) => (
          <div key={r.id} className="mini" onClick={() => openDrawer(r.id)}>
            <Avatar token={r.token} symbol={r.symbol} logo={r.logo} size={26} />
            <div>
              <b>{r.symbol}</b>
              <small>{usd(r.mcapUsd)}</small>
            </div>
            <Spark data={r.spark} width={46} height={18} />
            <Delta v={r.ch5m}>{pct(r.ch5m, 0)}</Delta>
            <button
              className="x"
              onClick={(e) => {
                e.stopPropagation();
                toggleWatch(r.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {watch.length > rows.length && <p className="empty">{watch.length - rows.length} watched pool(s) went quiet and were unloaded.</p>}
      </section>
      <section>
        <h3>Your activity</h3>
        {!trades.length && <p className="empty">Your buys and sells show up here.</p>}
        {trades.slice(0, 14).map((t) => (
          <a key={t.hash} className="act" href={txUrl(t.hash)} target="_blank" rel="noreferrer">
            <span className={t.side}>{t.side === 'buy' ? 'BUY' : 'SELL'}</span>
            <b>{t.symbol}</b>
            <span className="mono">{eth(t.eth)} ETH</span>
            <small>{t.reason ? `${t.reason} · ` : ''}{age(now - t.at)}</small>
          </a>
        ))}
      </section>
    </aside>
  );
}

export function Holdings({ board }) {
  const wallet = useWallet();
  const { sell } = useTrader();
  const key = wallet.address?.toLowerCase();
  const positions = useStore((s) => (key ? s.positions[key] : null));
  const rules = useStore((s) => (key ? s.rules[key] : null));
  const [open, setOpen] = useState(true);
  const ethUsd = board.meta?.ethUsd || 0;
  const list = useMemo(
    () =>
      Object.values(positions || {}).map((p) => {
        const row = board.byToken.get(p.token);
        return { p, row, v: valuePosition(p, row, ethUsd), rule: rules?.[p.token] };
      }),
    [positions, rules, board.byToken, ethUsd]
  );
  const totals = list.reduce(
    (t, { p, v }) => ({ value: t.value + v.valueEth, cost: t.cost + p.costEth, realized: t.realized + (p.realizedEth || 0) }),
    { value: 0, cost: 0, realized: 0 }
  );
  const pnl = totals.value - totals.cost;

  return (
    <section className={`dock ${open ? 'open' : ''}`}>
      <header onClick={() => setOpen((v) => !v)}>
        <h3>Holdings</h3>
        <span className="count">{list.length}</span>
        {wallet.authenticated && (
          <div className="dock-sum">
            <span>
              Value <b>{usd(totals.value * ethUsd)}</b>
            </span>
            <span>
              Unrealized <Delta v={pnl}>{usd(pnl * ethUsd)}</Delta>
            </span>
            <span>
              Realized <Delta v={totals.realized}>{usd(totals.realized * ethUsd)}</Delta>
            </span>
          </div>
        )}
        <span className="chev">{open ? '▾' : '▴'}</span>
      </header>
      {open && (
        <div className="dock-body">
          {!wallet.authenticated && <p className="empty">Log in to trade. Positions you open here are tracked with live PnL and TP/SL.</p>}
          {wallet.authenticated && !list.length && <p className="empty">No open positions. Hit ⚡ on any token to buy instantly.</p>}
          {list.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Amount</th>
                  <th>Cost</th>
                  <th>Value</th>
                  <th>PnL</th>
                  <th>Automation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map(({ p, row, v, rule }) => (
                  <tr key={p.token} onClick={() => openDrawer(row?.id || p.id)}>
                    <td>
                      <div className="tok">
                        <Avatar token={p.token} symbol={p.symbol} size={24} />
                        <b>{p.symbol}</b>
                        {!row && <small title="Pool not on the live board; using last known price">stale</small>}
                      </div>
                    </td>
                    <td className="mono">{num(v.qty)}</td>
                    <td className="mono">{eth(p.costEth)} ETH</td>
                    <td className="mono">{usd(v.valueUsd)}</td>
                    <td>
                      <Delta v={v.pnlPct}>
                        {pct(v.pnlPct)} · {eth(v.pnlEth)} ETH
                      </Delta>
                    </td>
                    <td>
                      {rule?.armed ? (
                        <span className="rule-chips">
                          {rule.tp != null && <span className="chip pos">TP +{rule.tp}%</span>}
                          {rule.sl != null && <span className="chip neg">SL -{rule.sl}%</span>}
                          {rule.trail != null && <span className="chip">Trail {rule.trail}%</span>}
                        </span>
                      ) : (
                        <span className="dim">off</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-btns">
                        <button className="mini-btn" onClick={() => sell({ ...p, ...(row || {}) , token: p.token, decimals: p.decimals }, 0.5).catch(() => {})}>
                          50%
                        </button>
                        <button className="mini-btn sell" onClick={() => sell({ ...p, ...(row || {}), token: p.token, decimals: p.decimals }, 1).catch(() => {})}>
                          Sell all
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

export function Palette({ rows, onClose }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? rows.filter((r) => `${r.symbol} ${r.name} ${r.token}`.toLowerCase().includes(s)) : rows;
    return [...list].sort((a, b) => b.vol1hUsd - a.vol1hUsd).slice(0, 12);
  }, [q, rows]);
  const pick = (r) => {
    openDrawer(r.id);
    onClose();
  };
  return (
    <div className="modal-backdrop top" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          placeholder="Search symbol, name or 0x contract…"
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') setI((x) => Math.min(x + 1, results.length - 1));
            if (e.key === 'ArrowUp') setI((x) => Math.max(x - 1, 0));
            if (e.key === 'Enter' && results[i]) pick(results[i]);
          }}
        />
        <div className="palette-list">
          {results.map((r, k) => (
            <div key={r.id} className={`palette-item ${k === i ? 'on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => pick(r)}>
              <Avatar token={r.token} symbol={r.symbol} logo={r.logo} size={28} />
              <b>{r.symbol}</b>
              <span className="name">{r.name}</span>
              <span className="mono">{usd(r.mcapUsd)}</span>
              <Delta v={r.ch1h}>{pct(r.ch1h)}</Delta>
            </div>
          ))}
          {!results.length && <div className="empty">No matches</div>}
        </div>
      </div>
    </div>
  );
}

const ACCENTS = {
  lime: ['#c6f432', '#a6d916'],
  mint: ['#7ef0c1', '#2fd39a'],
  sky: ['#8fd8ff', '#3fb3f0'],
  peach: ['#ffc98f', '#ff9a5c'],
};

export function applyAccent(name) {
  const [a, b] = ACCENTS[name] || ACCENTS.lime;
  document.documentElement.style.setProperty('--accent', a);
  document.documentElement.style.setProperty('--accent-2', b);
}

export function Settings({ onClose }) {
  const s = useStore((st) => st.settings);
  const fileRef = useRef(null);
  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gomo-settings.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importSettings = async (file) => {
    try {
      const parsed = JSON.parse(await file.text());
      set({ settings: (cur) => ({ ...cur, ...parsed, filters: { ...cur.filters, ...(parsed.filters || {}) } }) });
      toast('Settings imported', { kind: 'success' });
    } catch {
      toast('That file is not a Gomo settings export', { kind: 'error' });
    }
  };
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings">
        <h4>Trading</h4>
        <div className="grid2">
          <NumField label="Slippage" suffix="%" value={s.slippage} onChange={(v) => setSettings({ slippage: Math.min(49, Math.max(0.5, v || 0.5)) })} />
          <NumField label="Quick buy" suffix="ETH" value={s.quickBuy} onChange={(v) => setSettings({ quickBuy: v })} />
        </div>
        <label className="field">
          <span>Preset amounts (ETH, comma separated)</span>
          <div className="field-input">
            <input
              defaultValue={s.presets.join(', ')}
              onBlur={(e) => {
                const p = e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => x > 0).slice(0, 6);
                if (p.length) setSettings({ presets: p });
              }}
            />
          </div>
        </label>
        <h4>Display</h4>
        <div className="accents">
          {Object.entries(ACCENTS).map(([k, [a, b]]) => (
            <button
              key={k}
              className={s.accent === k ? 'on' : ''}
              style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
              onClick={() => {
                setSettings({ accent: k });
                applyAccent(k);
              }}
              title={k}
            />
          ))}
        </div>
        <Toggle label="Compact rows" checked={s.compact} onChange={(v) => setSettings({ compact: v })} />
        <Toggle label="Pause lane order while hovering" checked={s.pauseOnHover} onChange={(v) => setSettings({ pauseOnHover: v })} />
        <h4>Backup</h4>
        <div className="row-btns">
          <button className="cta ghost" onClick={exportSettings}>
            Export settings
          </button>
          <button className="cta ghost" onClick={() => fileRef.current?.click()}>
            Import settings
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && importSettings(e.target.files[0])} />
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, CrosshairMode } from 'lightweight-charts'
import { loadCandles, cachedCandles, loadTrades } from '../lib/api.js'
import { fmtTiny, fmtCompact, fmtEth } from '../lib/format.js'

const TF_SEC = { '1s': 1, '15s': 15, '30s': 30, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400 }
const isSec = (tf) => TF_SEC[tf] < 60
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

// Candles from on-chain trades. Like TradingView, each candle opens where the previous one
// closed, so a single trade still draws a real body instead of a flat dash.
function candlesFromTrades(trades, step) {
  const out = []
  for (const t of [...trades].sort((a, b) => a.t - b.t)) {
    if (!t.price) continue
    const time = Math.floor(t.t / 1000 / step) * step
    const last = out[out.length - 1]
    if (last && last.time === time) {
      last.high = Math.max(last.high, t.price)
      last.low = Math.min(last.low, t.price)
      last.close = t.price
      last.value += t.usd
    } else {
      const open = last ? last.close : t.price
      out.push({ time, open, high: Math.max(open, t.price), low: Math.min(open, t.price), close: t.price, value: t.usd })
    }
  }
  return out
}

export default function Chart({ pool, tf, mode, myTrades, entryMc }) {
  const box = useRef(null)
  const api = useRef({})
  const raw = useRef([])
  const [status, setStatus] = useState('loading')
  const [legend, setLegend] = useState(null)

  const supply = pool?.fdv && pool?.priceUsd ? pool.fdv / pool.priceUsd : 1
  const k = mode === 'mc' ? supply : 1
  const scale = (c) => ({ time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })
  const fmt = (v) => (mode === 'mc' ? '$' + fmtCompact(v, 2) : '$' + fmtTiny(v))
  // frame the newest ~90 candles at a fixed width, like TradingView
  const frame = () => {
    const ts = api.current.chart?.timeScale()
    if (!ts) return
    const n = raw.current.length
    ts.applyOptions({ barSpacing: 9 })
    ts.setVisibleLogicalRange({ from: Math.max(-4, n - 90), to: n + 6 })
  }
  // async loaders call the latest paint (current trades, mode and timeframe), never a stale copy
  const paintRef = useRef(null)
  paintRef.current = () => paint()

  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: css('--fg-3'), fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--line') } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: css('--fg-4'), width: 1, style: 3, labelBackgroundColor: css('--fg') }, horzLine: { color: css('--fg-4'), width: 1, style: 3, labelBackgroundColor: css('--fg') } },
      rightPriceScale: { borderColor: css('--line'), scaleMargins: { top: 0.14, bottom: 0.2 } },
      timeScale: { borderColor: css('--line'), timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 9, minBarSpacing: 2 },
      localization: { locale: 'en-US' },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: css('--up'),
      downColor: css('--down'),
      wickUpColor: css('--up'),
      wickDownColor: css('--down'),
      borderVisible: false,
      priceLineColor: css('--fg-3'),
      priceLineStyle: 2,
    })
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } })
    const markers = createSeriesMarkers(candles, [])
    chart.subscribeCrosshairMove((p) => setLegend(p?.seriesData?.get(candles) || null))
    api.current = { chart, candles, vol, markers }
    return () => chart.remove()
  }, [])

  // follow light/dark switches
  useEffect(() => {
    const mo = new MutationObserver(() => {
      const { chart, candles } = api.current
      if (!chart) return
      chart.applyOptions({
        layout: { textColor: css('--fg-3') },
        grid: { vertLines: { visible: false }, horzLines: { color: css('--line') } },
        rightPriceScale: { borderColor: css('--line') },
        timeScale: { borderColor: css('--line') },
      })
      candles.applyOptions({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down') })
      paintRef.current()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    api.current.candles?.applyOptions({ priceFormat: { type: 'custom', minMove: 1e-14, formatter: fmt } })
    paint()
  }, [mode, k])

  function paint() {
    const { candles, vol } = api.current
    if (!candles || !raw.current.length) return
    candles.setData(raw.current.map(scale))
    const up = css('--up'), down = css('--down')
    vol.setData(raw.current.map((c) => ({ time: c.time, value: c.value, color: (c.close >= c.open ? up : down) + '40' })))
    paintMarkers()
  }

  function paintMarkers() {
    const { markers } = api.current
    if (!markers || !raw.current.length) return
    const step = TF_SEC[tf]
    const times = raw.current.map((c) => c.time)
    // snap each trade to the candle it happened in (or the nearest one), so every paper trade shows
    const snap = (t) => {
      const b = Math.floor(t / 1000 / step) * step
      let lo = 0, hi = times.length - 1
      if (b <= times[0]) return times[0]
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (times[mid] <= b) lo = mid
        else hi = mid - 1
      }
      return times[lo]
    }
    const first = times[0] - step
    const list = (myTrades || [])
      .filter((t) => t.t / 1000 >= first)
      .map((t) => ({ time: snap(t.t), side: t.side, eth: t.eth }))
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: m.time,
        position: m.side === 'buy' ? 'belowBar' : 'aboveBar',
        color: m.side === 'buy' ? css('--up') : css('--down'),
        shape: m.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: (m.side === 'buy' ? 'B ' : 'S ') + fmtEth(m.eth, 3),
        size: 1.3,
      }))
    markers.setMarkers(list)
  }

  // dashed line at the average entry of the open position
  const entryLine = useRef(null)
  useEffect(() => {
    const { candles } = api.current
    if (!candles) return
    if (entryLine.current) {
      candles.removePriceLine(entryLine.current)
      entryLine.current = null
    }
    if (entryMc > 0) {
      const price = mode === 'mc' ? entryMc : entryMc / supply
      entryLine.current = candles.createPriceLine({ price, color: css('--up'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Avg entry' })
    }
  }, [entryMc, mode, supply])

  useEffect(() => {
    if (!pool?.pool) return
    let alive = true
    api.current.chart?.applyOptions({ timeScale: { secondsVisible: isSec(tf) } })
    const cached = isSec(tf) ? null : cachedCandles(pool.pool, tf)
    raw.current = cached ? cached.map((c) => ({ ...c })) : []
    setStatus(raw.current.length ? 'ok' : 'loading')
    if (raw.current.length) {
      paintRef.current()
      frame()
    }
    const load = async (first) => {
      try {
        let data
        if (isSec(tf)) data = candlesFromTrades(await loadTrades(pool.pool), TF_SEC[tf])
        else {
          data = (await loadCandles(pool.pool, tf)).map((c) => ({ ...c }))
          // brand-new pairs have no candles yet: build them from the live trades
          if (!data.length) data = candlesFromTrades(await loadTrades(pool.pool).catch(() => []), TF_SEC[tf])
        }
        if (!alive) return
        const hadData = raw.current.length > 0
        // keep live-tick candles newer than the fetched data
        const lastT = data.length ? data[data.length - 1].time : 0
        raw.current = [...data, ...raw.current.filter((c) => c.time > lastT)]
        if (!data.length) return setStatus('empty')
        setStatus('ok')
        paintRef.current()
        if (first && !hadData) frame()
      } catch {
        if (alive && !raw.current.length) setStatus('error')
      }
    }
    load(true)
    const id = setInterval(() => load(false), isSec(tf) ? 6000 : tf === '1m' ? 45000 : 90000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [pool?.pool, tf])

  // live tick: fold the latest price into the current candle
  useEffect(() => {
    const price = pool?.priceUsd
    if (!price || !raw.current.length) return
    const step = TF_SEC[tf]
    const bucket = Math.floor(Date.now() / 1000 / step) * step
    const last = raw.current[raw.current.length - 1]
    let c
    if (bucket > last.time) {
      c = { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, value: 0 }
      raw.current.push(c)
    } else {
      c = last
      c.close = price
      c.high = Math.max(c.high, price)
      c.low = Math.min(c.low, price)
    }
    api.current.candles?.update(scale(c))
  }, [pool?.priceUsd])

  // a paper trade also ticks the chart, so its marker lands on a live candle
  useEffect(() => {
    paintMarkers()
  }, [myTrades?.length, tf])

  const lg = legend && legend.open !== undefined ? legend : null
  const chg = lg ? ((lg.close - lg.open) / lg.open) * 100 : null
  return (
    <div className="chart-box">
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', left: 12, top: 8, zIndex: 2, fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', display: 'flex', gap: 10, pointerEvents: 'none' }}>
        <span style={{ color: 'var(--fg-2)' }}>{pool?.symbol}/{pool?.quote} · {tf} · {mode === 'mc' ? 'Market cap' : 'Price'} (USD){isSec(tf) ? ' · built from on-chain trades' : ''}</span>
        {lg && (
          <span>
            O <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.open)}</b> H <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.high)}</b> L <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.low)}</b> C <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.close)}</b>
          </span>
        )}
      </div>
      {status !== 'ok' && (
        <div className="chart-msg">
          {status === 'loading' && 'Loading candles…'}
          {status === 'empty' && 'No trades in this window yet. The chart fills in as trades come in.'}
          {status === 'error' && 'Could not load candles right now. Retrying automatically.'}
        </div>
      )}
    </div>
  )
}

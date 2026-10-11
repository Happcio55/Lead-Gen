import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, CrosshairMode } from 'lightweight-charts'
import { loadCandles, cachedCandles } from '../lib/api.js'
import { fmtTiny, fmtCompact } from '../lib/format.js'

const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400 }
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

export default function Chart({ pool, tf, mode, myTrades }) {
  const box = useRef(null)
  const api = useRef({})
  const raw = useRef([])
  const [status, setStatus] = useState('loading')
  const [legend, setLegend] = useState(null)

  const supply = pool?.fdv && pool?.priceUsd ? pool.fdv / pool.priceUsd : 1
  const k = mode === 'mc' ? supply : 1
  const scale = (c) => ({ time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })
  const fmt = (v) => (mode === 'mc' ? '$' + fmtCompact(v, 2) : '$' + fmtTiny(v))

  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: css('--fg-3'), fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: css('--fg-4'), labelBackgroundColor: css('--panel-3') }, horzLine: { color: css('--fg-4'), labelBackgroundColor: css('--panel-3') } },
      rightPriceScale: { borderColor: css('--line'), scaleMargins: { top: 0.14, bottom: 0.2 } },
      timeScale: { borderColor: css('--line'), timeVisible: true, secondsVisible: false, rightOffset: 8 },
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
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })
    const markers = createSeriesMarkers(candles, [])
    chart.subscribeCrosshairMove((p) => setLegend(p?.seriesData?.get(candles) || null))
    api.current = { chart, candles, vol, markers }
    return () => chart.remove()
  }, [])

  // follow light/dark switches
  const paintRef = useRef(null)
  paintRef.current = () => paint()
  useEffect(() => {
    const mo = new MutationObserver(() => {
      const { chart, candles } = api.current
      if (!chart) return
      chart.applyOptions({
        layout: { textColor: css('--fg-3') },
        grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
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
    const first = raw.current[0].time
    const list = (myTrades || [])
      .map((t) => ({ time: Math.floor(t.t / 1000 / step) * step, side: t.side }))
      .filter((m) => m.time >= first)
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: m.time,
        position: m.side === 'buy' ? 'belowBar' : 'aboveBar',
        color: m.side === 'buy' ? css('--up') : css('--down'),
        shape: m.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: m.side === 'buy' ? 'B' : 'S',
      }))
    markers.setMarkers(list)
  }

  useEffect(() => {
    if (!pool?.pool) return
    let alive = true
    const cached = cachedCandles(pool.pool, tf)
    raw.current = cached ? cached.map((c) => ({ ...c })) : []
    setStatus(raw.current.length ? 'ok' : 'loading')
    if (raw.current.length) {
      paint()
      api.current.chart.timeScale().fitContent()
    }
    const load = async (first) => {
      try {
        const data = (await loadCandles(pool.pool, tf)).map((c) => ({ ...c }))
        if (!alive) return
        const hadData = raw.current.length > 0
        raw.current = data
        if (!data.length) return setStatus('empty')
        setStatus('ok')
        paint()
        if (first && !hadData) api.current.chart.timeScale().fitContent()
      } catch {
        if (alive && !raw.current.length) setStatus('error')
      }
    }
    load(true)
    const id = setInterval(() => load(false), tf === '1m' ? 45000 : 90000)
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

  useEffect(paintMarkers, [myTrades?.length, tf])

  const lg = legend && legend.open !== undefined ? legend : null
  const chg = lg ? ((lg.close - lg.open) / lg.open) * 100 : null
  return (
    <div className="chart-box">
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', left: 12, top: 8, zIndex: 2, fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', display: 'flex', gap: 10, pointerEvents: 'none' }}>
        <span style={{ color: 'var(--fg-2)' }}>{pool?.symbol}/{pool?.quote} · {tf} · {mode === 'mc' ? 'Market cap' : 'Price'} (USD)</span>
        {lg && (
          <span>
            O <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.open)}</b> H <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.high)}</b> L <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.low)}</b> C <b className={chg >= 0 ? 'up' : 'down'}>{fmt(lg.close)}</b>
          </span>
        )}
      </div>
      {status !== 'ok' && (
        <div className="chart-msg">
          {status === 'loading' && 'Loading candles…'}
          {status === 'empty' && 'This pair is too new for candles. The chart fills in as trades come in.'}
          {status === 'error' && 'Could not load candles right now. Retrying automatically.'}
        </div>
      )}
    </div>
  )
}

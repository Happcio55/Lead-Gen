import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, CrosshairMode } from 'lightweight-charts'
import { loadCandles } from '../lib/api.js'
import { fmtTiny, fmtCompact } from '../lib/format.js'

const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400 }
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

export default function Chart({ pool, tf, mode, myTrades, theme }) {
  const box = useRef(null)
  const api = useRef({})
  const raw = useRef([])
  const [status, setStatus] = useState('loading')
  const [legend, setLegend] = useState(null)

  const supply = pool?.fdv && pool?.priceUsd ? pool.fdv / pool.priceUsd : 1
  const k = mode === 'mc' ? supply : 1
  const scale = (c) => ({ time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })

  // create chart once
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: css('--fg-3'), fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: css('--line-strong'), scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderColor: css('--line-strong'), timeVisible: true, secondsVisible: false, rightOffset: 6 },
      localization: { locale: 'da-DK' },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: css('--up'),
      downColor: css('--down'),
      wickUpColor: css('--up'),
      wickDownColor: css('--down'),
      borderVisible: false,
      priceLineColor: css('--neon'),
    })
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const markers = createSeriesMarkers(candles, [])
    chart.subscribeCrosshairMove((p) => {
      const d = p?.seriesData?.get(candles)
      setLegend(d ? d : null)
    })
    api.current = { chart, candles, vol, markers }
    return () => chart.remove()
  }, [])

  // theme colours
  useEffect(() => {
    const { chart, candles } = api.current
    if (!chart) return
    chart.applyOptions({
      layout: { textColor: css('--fg-3') },
      grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
      rightPriceScale: { borderColor: css('--line-strong') },
      timeScale: { borderColor: css('--line-strong') },
    })
    candles.applyOptions({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down') })
    paint()
  }, [theme])

  // price formatter follows the mode
  useEffect(() => {
    api.current.candles?.applyOptions({
      priceFormat: { type: 'custom', minMove: 1e-14, formatter: (v) => (mode === 'mc' ? '$' + fmtCompact(v, 2) : '$' + fmtTiny(v)) },
    })
    paint()
  }, [mode, k])

  function paint() {
    const { candles, vol } = api.current
    if (!candles || !raw.current.length) return
    candles.setData(raw.current.map(scale))
    const up = css('--up'), down = css('--down')
    vol.setData(raw.current.map((c) => ({ time: c.time, value: c.value, color: (c.close >= c.open ? up : down) + '55' })))
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
        color: m.side === 'buy' ? css('--neon') : css('--down'),
        shape: m.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: m.side === 'buy' ? 'K' : 'S',
      }))
    markers.setMarkers(list)
  }

  // load + poll candles
  useEffect(() => {
    if (!pool?.pool) return
    let alive = true
    setStatus('loading')
    raw.current = []
    const load = async (first) => {
      try {
        const data = await loadCandles(pool.pool, tf)
        if (!alive) return
        raw.current = data
        if (!data.length) return setStatus('empty')
        setStatus('ok')
        paint()
        if (first) api.current.chart.timeScale().fitContent()
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

  const fmt = (v) => (mode === 'mc' ? '$' + fmtCompact(v, 2) : '$' + fmtTiny(v))
  return (
    <>
      <div className="chart-box">
        <div ref={box} style={{ position: 'absolute', inset: 0 }} />
        {status !== 'ok' && (
          <div className="chart-msg">
            {status === 'loading' && 'Henter candles…'}
            {status === 'empty' && 'Parret er for nyt til candles. Grafen fyldes op, efterhånden som der handles.'}
            {status === 'error' && 'Kunne ikke hente candles lige nu. Der prøves igen automatisk.'}
          </div>
        )}
      </div>
      <div className="legend" style={{ padding: '0 12px 10px', marginLeft: 0 }}>
        {legend && legend.open !== undefined ? (
          <>Å {fmt(legend.open)} · H {fmt(legend.high)} · L {fmt(legend.low)} · Luk {fmt(legend.close)}</>
        ) : (
          <>Kilde: GeckoTerminal candles + live pris fra DexScreener</>
        )}
      </div>
    </>
  )
}

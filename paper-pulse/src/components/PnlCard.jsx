import { useEffect, useRef } from 'react'
import { fmtEth, fmtSignedEth, fmtPct, fmtUsdC } from '../lib/format.js'
import { Icon } from './ui.jsx'

const W = 1200
const H = 630

function fmtDur(ms) {
  const m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ' + (m % 60) + 'm'
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
}

async function draw(cv, d) {
  await document.fonts?.ready
  const c = cv.getContext('2d')
  const win = d.pnl >= 0
  const acc = win ? '#c9ff3f' : '#ff4d6d'
  c.fillStyle = '#06070b'
  c.fillRect(0, 0, W, H)
  const g = c.createRadialGradient(W * 0.82, H * 0.9, 20, W * 0.82, H * 0.9, 640)
  g.addColorStop(0, win ? 'rgba(201,255,63,0.28)' : 'rgba(255,77,109,0.24)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
  c.strokeStyle = 'rgba(255,255,255,0.035)'
  c.lineWidth = 1
  for (let x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke() }
  for (let y = 0; y < H; y += 48) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke() }

  // pulse line across the card
  c.save()
  c.strokeStyle = acc
  c.globalAlpha = 0.5
  c.lineWidth = 3
  c.shadowColor = acc
  c.shadowBlur = 18
  c.beginPath()
  const pts = win ? [[620, 470], [720, 470], [760, 380], [820, 520], [880, 300], [960, 360], [1040, 180], [1200, 120]] : [[620, 200], [720, 200], [760, 290], [820, 160], [880, 380], [960, 330], [1040, 480], [1200, 540]]
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.stroke()
  c.restore()

  const sans = 'Geist, "DM Sans", system-ui, sans-serif'
  // brand
  const logo = await new Promise((res) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = '/paper-p-256.png'
  })
  if (logo) c.drawImage(logo, 54, 42, 62, 62)
  c.fillStyle = '#f4f5f9'
  c.font = `700 30px ${sans}`
  c.fillText('Paper', 124, 88)
  const tagX = 124 + c.measureText('Paper').width + 16
  c.font = `700 15px ${sans}`
  c.fillStyle = '#c9ff3f'
  c.beginPath()
  c.roundRect(tagX, 66, 118, 26, 6)
  c.fill()
  c.fillStyle = '#0b0c08'
  c.fillText('PAPER TRADE', tagX + 12, 85)

  // token
  c.fillStyle = '#f4f5f9'
  c.font = `800 64px ${sans}`
  c.fillText('$' + d.symbol, 64, 200)
  c.fillStyle = '#7a7d92'
  c.font = `500 24px ${sans}`
  c.fillText(`${d.name}  ·  Robinhood Chain`, 66, 240)

  // pnl
  c.fillStyle = acc
  c.shadowColor = acc
  c.shadowBlur = 30
  c.font = `800 150px ${sans}`
  c.fillText(fmtPct(d.pnlPct, d.pnlPct >= 1000 ? 0 : 1), 58, 400)
  c.shadowBlur = 0
  c.font = `700 40px ${sans}`
  c.fillText(fmtSignedEth(d.pnl) + ' ETH', 64, 462)

  // stats row
  const stats = [
    ['Invested', fmtEth(d.invested) + ' ETH'],
    [d.open ? 'Value' : 'Returned', fmtEth(d.returned) + ' ETH'],
    ['Entry MC', fmtUsdC(d.entryMc)],
    [d.open ? 'Current MC' : 'Exit MC', fmtUsdC(d.exitMc)],
    ['Held', fmtDur(d.held)],
  ]
  stats.forEach(([l, v], i) => {
    const x = 64 + i * 205
    c.fillStyle = '#7a7d92'
    c.font = `600 18px ${sans}`
    c.fillText(l, x, 540)
    c.fillStyle = '#f4f5f9'
    c.font = `700 26px ${sans}`
    c.fillText(v, x, 574)
  })
  c.fillStyle = '#4e5166'
  c.font = `500 15px ${sans}`
  c.fillText('Simulated trade with paper ETH. Not real funds.', 64, 612)
}

export default function PnlCard({ data, onClose }) {
  const cv = useRef(null)
  useEffect(() => {
    if (cv.current && data) draw(cv.current, data)
  }, [data])
  if (!data) return null
  function download() {
    const a = document.createElement('a')
    a.href = cv.current.toDataURL('image/png')
    a.download = `paper-${data.symbol}-pnl.png`
    a.click()
  }
  return (
    <div className="scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2>PnL card · {data.symbol}</h2>
          <button className="x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <canvas ref={cv} width={W} height={H} className="pnl-canvas" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn lime" onClick={download}><Icon name="download" size={14} />Download PNG</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// Build card data from a position (open or closed).
export function pnlFromPosition(pos, live) {
  const open = pos.tokens > 0
  const value = open && live ? live.valueEth : 0
  const returned = pos.sold + value
  const pnl = returned - pos.bought
  return {
    symbol: pos.symbol,
    name: pos.name,
    open,
    invested: pos.bought,
    returned,
    pnl,
    pnlPct: pos.bought ? (pnl / pos.bought) * 100 : 0,
    entryMc: pos.entryMc,
    exitMc: open ? live?.mc : pos.exitMc || pos.lastMc,
    held: (pos.closedAt || Date.now()) - (pos.openedAt || Date.now()),
  }
}

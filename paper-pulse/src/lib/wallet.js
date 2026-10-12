import { createStore, storage } from './store.js'
import { paper, switchIdentity } from './paper.js'

/*
  Wallet sign-in. The wallet signs a plain text message (no transaction, no gas);
  the server checks the signature and returns a session token. While signed in,
  the paper account is saved to the cloud under the wallet address, so profit,
  positions and history follow the wallet across devices.
*/

const SESSION_KEY = 'paperpulse:session'
export const wallet = createStore({
  providers: [],
  address: null,
  walletName: null,
  token: null,
  status: 'idle', // idle | connecting | signing | syncing | synced | error
  lastSaved: 0,
  error: null,
})

/* ---------- EIP-6963 wallet discovery ---------- */
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const { info, provider } = e.detail || {}
    if (!info?.uuid) return
    wallet.set((s) => (s.providers.some((p) => p.info.uuid === info.uuid) ? s : { ...s, providers: [...s.providers, { info, provider }] }))
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

export function availableWallets() {
  const list = wallet.get().providers
  if (list.length) return list
  if (window.ethereum) return [{ info: { uuid: 'injected', name: window.ethereum.isMetaMask ? 'MetaMask' : 'Browser wallet', icon: null }, provider: window.ethereum }]
  return []
}

const toHex = (s) => '0x' + [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function api(path, opts = {}) {
  const { token } = wallet.get()
  const r = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status })
  return j
}

export async function connect(entry) {
  const { provider, info } = entry
  try {
    wallet.set({ status: 'connecting', error: null })
    const [address] = await provider.request({ method: 'eth_requestAccounts' })
    if (!address) throw new Error('No account selected')
    const message = [
      'Paper wants you to sign in with your wallet.',
      '',
      'This only proves you own this address. It is free, sends no transaction and gives no access to your funds.',
      '',
      `Address: ${address}`,
      `Issued at: ${new Date().toISOString()}`,
    ].join('\n')
    wallet.set({ status: 'signing' })
    const signature = await provider.request({ method: 'personal_sign', params: [toHex(message), address] })
    const { token } = await api('/api/auth', { method: 'POST', body: JSON.stringify({ address, message, signature }) })
    const addr = address.toLowerCase()
    wallet.set({ address: addr, token, walletName: info.name })
    storage.set(SESSION_KEY, { address: addr, token, walletName: info.name })
    await pull()
    return { ok: true }
  } catch (e) {
    const msg = e.code === 4001 ? 'Request rejected in your wallet.' : e.status === 404 ? 'Sign-in is only available on the live site.' : e.message || 'Could not connect.'
    wallet.set({ status: 'error', error: msg })
    return { ok: false, msg }
  }
}

// Load the cloud copy; a wallet with nothing saved yet keeps the current progress and uploads it.
async function pull() {
  const { address } = wallet.get()
  wallet.set({ status: 'syncing' })
  const { state } = await api('/api/account')
  switchIdentity(address, state)
  if (!state) await push()
  else wallet.set({ status: 'synced', lastSaved: Date.now() })
}

let saving = null
let dirty = false
async function push() {
  if (!wallet.get().token) return
  if (saving) {
    dirty = true
    return saving
  }
  wallet.set({ status: 'syncing' })
  saving = api('/api/account', { method: 'PUT', body: JSON.stringify({ state: paper.get() }) })
    .then(() => wallet.set({ status: 'synced', lastSaved: Date.now(), error: null }))
    .catch((e) => {
      if (e.status === 401) disconnect('Your session expired. Connect your wallet again.')
      else wallet.set({ status: 'error', error: 'Could not save to the cloud. Retrying on your next trade.' })
    })
    .finally(() => {
      saving = null
      if (dirty) {
        dirty = false
        push()
      }
    })
  return saving
}

// Debounced cloud save on every change while signed in.
let timer = null
paper.subscribe(() => {
  if (!wallet.get().token) return
  clearTimeout(timer)
  timer = setTimeout(push, 1500)
})

export function disconnect(reason) {
  storage.set(SESSION_KEY, null)
  wallet.set({ address: null, token: null, walletName: null, status: reason ? 'error' : 'idle', error: reason || null })
  switchIdentity(null)
}

// Resume a saved session on load.
const saved = storage.get(SESSION_KEY, null)
if (saved?.token) {
  wallet.set({ address: saved.address, token: saved.token, walletName: saved.walletName })
  switchIdentity(saved.address)
  pull().catch((e) => (e.status === 401 ? disconnect('Your session expired. Connect your wallet again.') : wallet.set({ status: 'error', error: 'Offline. Changes are kept on this device.' })))
}

window.addEventListener('beforeunload', () => {
  if (timer && wallet.get().token) {
    clearTimeout(timer)
    fetch('/api/account', {
      method: 'PUT',
      keepalive: true,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + wallet.get().token },
      body: JSON.stringify({ state: paper.get() }),
    })
  }
})

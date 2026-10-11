// One wallet interface for the app, backed either by Privy (email/social login + embedded wallet,
// or an external wallet connected through Privy) or by a plain injected wallet (MetaMask, Rabby, …)
// when no Privy app id is configured.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets, useSendTransaction, useExportWallet } from '@privy-io/react-auth';
import { toHex } from 'viem';
import { CHAIN_ID, DEFAULT_RPC, EXPLORER } from '../../shared/chain.js';

const WalletContext = createContext(null);
export const useWallet = () => useContext(WalletContext);

function txParams(tx) {
  return { to: tx.to, data: tx.data, value: tx.value ?? 0n, chainId: CHAIN_ID };
}

export function PrivyWalletProvider({ children }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { exportWallet } = useExportWallet();

  const wallet = useMemo(
    () => wallets.find((w) => w.walletClientType === 'privy') || wallets[0] || null,
    [wallets]
  );
  const embedded = wallet?.walletClientType === 'privy';

  const send = useCallback(
    async (tx) => {
      if (!wallet) throw new Error('No wallet connected');
      if (embedded) {
        // Embedded wallet: signs without a popup, which is what makes one-click buys and TP/SL possible.
        const { hash } = await sendTransaction(txParams(tx), { uiOptions: { showWalletUIs: false }, address: wallet.address });
        return hash;
      }
      await wallet.switchChain(CHAIN_ID);
      const provider = await wallet.getEthereumProvider();
      return provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: wallet.address, to: tx.to, data: tx.data, value: toHex(tx.value ?? 0n) }],
      });
    },
    [wallet, embedded, sendTransaction]
  );

  const value = {
    mode: 'privy',
    ready: ready && walletsReady,
    authenticated,
    address: authenticated ? wallet?.address ?? null : null,
    embedded,
    label: user?.email?.address || user?.google?.email || user?.twitter?.username || null,
    login,
    logout,
    send,
    exportKey: embedded ? () => exportWallet({ address: wallet.address }) : null,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

const CHAIN_HEX = toHex(CHAIN_ID);

async function ensureChain(eth) {
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if (e?.code !== 4902 && !/unrecognized|not been added|unknown chain/i.test(e?.message || '')) throw e;
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_HEX,
        chainName: 'Robinhood Chain',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [DEFAULT_RPC],
        blockExplorerUrls: [EXPLORER],
      }],
    });
  }
}

export function InjectedWalletProvider({ children }) {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
  const [address, setAddress] = useState(null);

  useEffect(() => {
    if (!eth) return;
    eth.request({ method: 'eth_accounts' }).then((a) => setAddress(a?.[0] ?? null)).catch(() => {});
    const onAccounts = (a) => setAddress(a?.[0] ?? null);
    eth.on?.('accountsChanged', onAccounts);
    return () => eth.removeListener?.('accountsChanged', onAccounts);
  }, [eth]);

  const login = useCallback(async () => {
    if (!eth) {
      window.open('https://rabby.io', '_blank', 'noopener');
      throw new Error('No browser wallet found. Install one, or set PRIVY_APP_ID for email login.');
    }
    const [a] = await eth.request({ method: 'eth_requestAccounts' });
    await ensureChain(eth);
    setAddress(a);
  }, [eth]);

  const send = useCallback(
    async (tx) => {
      if (!eth || !address) throw new Error('Connect a wallet first');
      await ensureChain(eth);
      return eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: address, to: tx.to, data: tx.data, value: toHex(tx.value ?? 0n) }],
      });
    },
    [eth, address]
  );

  const value = {
    mode: 'injected',
    ready: true,
    authenticated: !!address,
    address,
    embedded: false,
    label: null,
    login,
    logout: () => setAddress(null),
    send,
    exportKey: null,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

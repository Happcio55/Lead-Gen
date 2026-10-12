// Privy login island: email / Google / wallet login with an embedded wallet for people without one.
// It hands the resulting EIP-1193 provider to the main app through window events, so buying and selling
// work exactly as with a browser wallet. Built with `npm run build:login` into assets/login.js and only
// loaded when the server has a PRIVY_APP_ID configured.
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { defineChain } from 'viem';
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains';

const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Robinhood Explorer', url: 'https://robin.etherscan.io' } }
});

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

function Bridge() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  useEffect(() => {
    window.KairoPrivy = { ready, authenticated, login, logout };
    if (ready) emit('kairo:privy-ready', { authenticated });
  }, [ready, authenticated, login, logout]);

  // Prefer the embedded wallet for email/Google users, otherwise the wallet they connected.
  useEffect(() => {
    if (!ready || !authenticated) return;
    const w = wallets.find(x => x.walletClientType === 'privy') || wallets[0];
    if (!w) return;
    let cancelled = false;
    w.getEthereumProvider().then(provider => {
      if (cancelled) return;
      emit('kairo:privy-wallet', {
        provider,
        address: w.address,
        embedded: w.walletClientType === 'privy',
        label: user?.email?.address || user?.google?.email || null
      });
    });
    return () => { cancelled = true; };
  }, [ready, authenticated, wallets, user]);

  useEffect(() => {
    if (ready && !authenticated) emit('kairo:privy-logout', {});
  }, [ready, authenticated]);

  return null;
}

async function boot() {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (!cfg.privyAppId) return;
  const el = document.createElement('div');
  el.id = 'privy-root';
  document.body.appendChild(el);
  createRoot(el).render(
    <PrivyProvider
      appId={cfg.privyAppId}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: { theme: 'dark', accentColor: '#b9d08f', showWalletLoginFirst: false },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: robinhood,
        supportedChains: [robinhood, base, mainnet, arbitrum, optimism, bsc, polygon]
      }}
    >
      <Bridge />
    </PrivyProvider>
  );
}

boot();

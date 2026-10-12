// Base styles first: the brand's own stylesheet (pulled in through App) layers on top.
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { robinhood } from '../../shared/chain.js';
import { PRIVY_APPEARANCE } from '@brand-meta';
import App from './App.jsx';
import { InjectedWalletProvider, PrivyWalletProvider } from './wallet.jsx';

async function boot() {
  let config = {};
  try {
    config = await (await fetch('/api/config')).json();
  } catch {
    // server unreachable: render anyway, the board will show its reconnecting state
  }
  const appId = import.meta.env.VITE_PRIVY_APP_ID || config.privyAppId;
  const root = createRoot(document.getElementById('root'));

  if (!appId) {
    root.render(
      <StrictMode>
        <InjectedWalletProvider>
          <App />
        </InjectedWalletProvider>
      </StrictMode>
    );
    return;
  }

  root.render(
    <StrictMode>
      <PrivyProvider
        appId={appId}
        config={{
          loginMethods: ['email', 'google', 'twitter', 'wallet'],
          appearance: { theme: 'light', ...PRIVY_APPEARANCE, walletChainType: 'ethereum-only' },
          embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' }, showWalletUIs: false },
          defaultChain: robinhood,
          supportedChains: [robinhood],
        }}
      >
        <PrivyWalletProvider>
          <App />
        </PrivyWalletProvider>
      </PrivyProvider>
    </StrictMode>
  );
}

boot();

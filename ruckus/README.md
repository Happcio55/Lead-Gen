# Ruckus

A social trading desk for Solana coins, hosted by Rudy the raccoon.
It runs entirely in the browser: no build step and no server of its own.

## Run it

```sh
cd ruckus
python3 -m http.server 8000
# open http://localhost:8000
```

To put it online, see [Hosting](#hosting).

## What works

| Page | What it does |
| --- | --- |
| Home | Rudy front and centre, with live cards around him: the top trending coin, its biggest buyer, a buy box and a ticker of real trades. Rudy's speech bubble gives live tips. Below: the coins moving right now. |
| Trade | Live coin lists (Hot, New, Top, Watchlist, Holding) with mini charts, a candle chart (1m/5m/15m/1h), live trades, top buyers, coin details, safety badges, Rudy's safety read on the coin, and buy/sell through Jupiter (amount in USD or SOL) |
| Coins | Card grid with 24-hour mini charts. Sort by trending, most traded, newest, market cap or top gainers |
| Den | Feed where `$TICKER` turns into a live coin card; wallets you follow; wallets buying now; your positions |
| Wallet | Your holdings, their value now and your P&L on coins traded here. Any wallet address opens as a profile you can follow (`#w-<address>`) |
| Launch | Coin form with live preview and bonding-curve fill (saves a draft) |
| Rewards | Invite link, crumbs (points) and tasks |
| Pulse | SOL daily candles, trending volume, new coins in the last hour, biggest movers |

Search at the top (press `/`) finds any coin by name, ticker or mint, and opens any wallet address.
Every coin has a shareable link: `#c-<mint>`.

#

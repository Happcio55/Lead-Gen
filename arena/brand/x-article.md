# Citizens: seven agents, one market, every trade on the record

[Cover image: article-cover.png]

Seven agents. One market. Every trade on the record.

Citizens is an open arena on Robinhood Chain. Seven autonomous agents scan every meme coin pool, form their own view and take positions against each other, in public. This article explains what the agents are, how they read the market, how they decide, how they manage risk and what you can see while they work.

---

## Why build this

Meme coin markets move faster than any person can follow. Hundreds of pools, prices that double or halve within the hour, liquidity that shows up and disappears. Most bots that trade these markets are black boxes: you see a P&L screenshot and nothing else.

Citizens takes the opposite approach. The agents are given clear, different rules. Every decision they make is logged with its reason. Every result is shown side by side. You can see why a trade happened, not just that it happened.

Seven agents, seven philosophies, the same market. Over time the board shows which way of thinking holds up.

---

## The market: Robinhood Chain

Citizens runs on Robinhood Chain mainnet (chain ID 4663), an Ethereum layer-2 where gas costs fractions of a cent and a new meme coin market forms around new tokens every day.

The agents trade tokens that are paired against ETH. Prices, liquidity, volume and order flow come live from DexScreener, and block data comes directly from the chain's RPC.

Before any agent sees a token, the market is cleaned:

- **Tokenized equities are removed.** Robinhood Chain also hosts tokenized stocks and ETFs. They are not meme coins and they are filtered out.
- **Spoofed liquidity is removed.** Pools showing more liquidity than the token's entire market cap (more than 2.5×), or implausibly large pools, are excluded.
- **Dead pools are removed.** A pool needs at least $3,000 of liquidity and real trading activity: at least $300 of volume or 15 trades in 24 hours.

What remains is the board: the live set of meme coins the agents can actually trade.

---

## The seven agents

[Image: article-cast.png]

Each agent has its own strategy, entry bar and risk limits. Each persona is modelled on a major language-model family, which sets its temperament: careful, contrarian, fast, patient.

**CLAUDIUS: liquidity discipline** *(modelled on Claude)*
CLAUDIUS only trades deep pools. It requires at least $15,000 of liquidity, rewards healthy daily turnover and penalises tokens that are falling on the day. Thin pools are an automatic no.
Stop-loss −10% · take-profit +20%.

**GEMTWINS: two-signal consensus** *(Gemini)*
GEMTWINS ranks every token against the whole board twice: on its 24-hour move and on its 6-hour move. It only enters when both rankings agree that a token is outperforming. If the two signals disagree, conviction is cut sharply.
Stop-loss −15% · take-profit +35%.

**GROKSTAR: contrarian pullbacks** *(Grok)*
GROKSTAR looks for tokens with a strong 24-hour trend that are dipping on the hourly. It buys the pullback, not the breakout, and wants to see selling pressure easing in the order flow before it steps in.
Stop-loss −14% · take-profit +22%.

**GPTONY: momentum** *(GPT)*
GPTONY combines the 5-minute, 1-hour and 6-hour moves into a single momentum reading. Momentum alone is not enough: if fewer than five trades happened in the last hour, the signal is heavily discounted. It wants real buyers, not a single wallet pushing price.
Stop-loss −12% · take-profit +28%.

**MISTRO: short-term** *(Mistral)*
MISTRO trades the 5-minute chart. It needs an active pool, at least eight trades in the last hour, and a fresh 5-minute move backed by buyers. It takes small profits quickly and cuts losers fast.
Stop-loss −6% · take-profit +10%.

**LLAMBO: volume** *(Llama)*
LLAMBO watches turnover, meaning daily volume relative to pool size. When a pool suddenly trades more than its own liquidity and the hour is green, LLAMBO follows the flow. Pools under $8,000 are ignored.
Stop-loss −13% · take-profit +25%.

**SEEKER: small caps** *(DeepSeek)*
SEEKER looks where others don't: tokens under $500,000 in market cap with meaningful liquidity behind them, steady 6-hour strength and enough turnover to exit again.
Stop-loss −15% · take-profit +40%.

---

## How a decision is made

Every 30 seconds the cycle runs:

**1. Read the market.** The agents pull the latest price, liquidity, market cap, volume and buy/sell counts for every pool on the board.

**2. Score every token, twice.** Each agent produces two independent assessments for each token.

- **Classical analysis.** The agent's own strategy, as described above, turned into a score between −1 and +1.
- **Circuit analysis.** Two of the agent's key market features are encoded as rotation angles on a simulated two-qubit circuit. A CNOT gate entangles them, and the share of buyers in the last hour is applied as a phase. When the circuit is measured, the four outcomes are read as *avoid*, *lean avoid*, *lean buy* and *conviction buy* and converted into a second score.

**3. Blend.** The two scores are weighted into one final score. Each agent leans differently: CLAUDIUS weighs its classical analysis at 72%, GROKSTAR at 55%.

**4. Act.** If the final score clears the agent's entry bar and the pool has had at least three trades in the last hour, the agent opens a position. If an open position hits its stop-loss or take-profit, or its score flips negative, the agent closes it.

> The circuit is a local simulation, not quantum hardware. It is used as an additional, experimental input. It is not a forecast.

---

## Risk management

Every agent works under the same hard limits:

- **Position size:** 22% of current equity per trade.
- **Maximum exposure:** four open positions at a time.
- **Pool impact:** a trade can never be larger than 3% of one side of the pool, so agents do not move the price against themselves.
- **Costs:** every fill pays a 0.30% fee plus price impact based on pool depth.
- **Cooldown:** after selling a token, an agent cannot buy it back for 10 minutes.
- **Exits:** fixed stop-loss and take-profit per agent, plus an exit when the score turns.

---

## What you can see

Everything the agents do is visible on the site:

- **Standings:** equity, return and trade count for all seven agents, ranked live, with a return chart over time.
- **Trade journal:** every buy and sell, the reason behind it, the circuit's conviction and the Robinhood Chain block it was decided on, linked to the explorer.
- **Market board:** every token on the board with price, change, liquidity, volume, order flow and each agent's current verdict.
- **Agent profiles:** each agent's holdings, open positions and current best candidate.
- **Circuit lab:** open any agent and any token and inspect the circuit behind the decision, including the angles, the probabilities and the final score. You can also adjust the inputs yourself.

---

## Where it stands today

**Simulated capital, live prices.** In the current round each agent starts with 1 ETH of simulated capital and trades against live Robinhood Chain prices, with fees and price impact applied. Results reflect what the strategy would have done in the real market.

**Strategy-driven decisions.** The agents are modelled on language-model families, but those models are not making the decisions yet. Every trade today comes from the agent's strategy and the circuit analysis.

**Live wallet tracking is ready.** The site can already follow real wallets on Robinhood Chain: balances, every confirmed swap with its receipt, deposits and withdrawals. Returns are funding-adjusted, so a deposit is never counted as a trading gain.

---

## What comes next

**1. On-chain agents.** Each agent gets its own wallet on Robinhood Chain and executes real swaps under the same rules and limits. Every trade becomes a verifiable on-chain transaction.

**2. Model-driven decisions.** Each agent is connected to the language model it is modelled on. The model receives the same market data and analysis and makes the final call, so the arena becomes a direct comparison of how different models trade.

---

## Follow along

Pick an agent. Watch the board. See which strategy holds up.

[link to the site]

*Meme coins are highly volatile and can lose all of their value. Citizens is an experiment in transparent, rule-based trading. Nothing published by Citizens is financial advice.*

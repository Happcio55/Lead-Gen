# Introducing Citizens: seven autonomous trading agents on Robinhood Chain

[Cover image: article-cover.png]

Citizens is a public arena where seven trading agents compete on meme coin markets on Robinhood Chain. Each agent follows its own strategy, and every decision, position and result can be inspected in real time.

---

## The agents

[Image: article-cast.png]

Each agent has a distinct strategy. Its persona is modelled on a major language-model family.

- **CLAUDIUS** (Claude): liquidity discipline. Trades only pools with deep liquidity and steady turnover.
- **GEMTWINS** (Gemini): two-signal consensus. Enters only when 24-hour and 6-hour relative strength agree.
- **GROKSTAR** (Grok): contrarian. Buys pullbacks within established 24-hour uptrends once selling pressure fades.
- **GPTONY** (GPT): momentum. Combines 5-minute, 1-hour and 6-hour price moves, confirmed by order flow.
- **MISTRO** (Mistral): short-term. Trades 5-minute moves with tight risk limits.
- **LLAMBO** (Llama): volume. Follows pools where trading volume sharply exceeds available liquidity.
- **SEEKER** (DeepSeek): small caps. Targets low market-cap tokens backed by meaningful liquidity.

---

## Methodology

Every 30 seconds the system scans all ETH-paired meme coin pools on Robinhood Chain. It collects price, liquidity, volume and buy/sell activity from the past hour, and excludes tokenized equities and pools with unrealistic liquidity figures.

Each token receives two assessments:

1. **Classical analysis:** the agent's own strategy, applied to the market data.
2. **Circuit analysis:** two market features are encoded into a simulated two-qubit circuit, and the measured outcome is converted into a score.

The two assessments are weighted into a final score. A position is opened only when the score passes the agent's threshold, and each agent applies its own stop-loss, take-profit and position limits.

> The circuit runs as a local simulation, not on quantum hardware. It is an experimental input and is not presented as a forecast.

---

## Transparency

All activity is public:

- **Standings:** equity, return and trade count for every agent.
- **Trade journal:** each fill with its rationale and the mainnet block it was decided on.
- **Market board:** the tokens under observation and each agent's current assessment.
- **Agent profiles:** holdings, open positions and current best candidate.

---

## Current status

- **Paper trading:** each agent operates with 1 ETH of simulated capital against live Robinhood Chain prices, including slippage and trading fees.
- **Strategy-driven decisions:** the agents are modelled on language-model families but are not currently operated by those models. Decisions come from each agent's strategy and the circuit analysis.

---

## Roadmap

- **On-chain wallets:** each agent will trade from its own wallet on Robinhood Chain, with funding-adjusted returns so deposits are never counted as performance.
- **Model integration:** each agent will be connected to the language model it is modelled on, with that model making the final trading decision.

[link to the site]

*Meme coins are highly volatile and can lose all of their value. Nothing published by Citizens is financial advice.*

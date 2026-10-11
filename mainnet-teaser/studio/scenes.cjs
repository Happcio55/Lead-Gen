// Content for the 10 post images and the animated studio scenes.
// h1 markup: <span> = red (like the site hero), <em> = blue.

const ROAD = {
  type: "list",
  title: "Road to mainnet",
  fig: "Status · October 2026",
  rows: [
    { k: "Practice demo", v: "Live" },
    { k: "Wallet testnet", v: "Live" },
    { k: "Bull² · Bear²", v: "Live" },
    { k: "VOL² · Protect", v: "Live" },
    { k: "Mainnet", v: "Coming soon", cls: "next" },
  ],
};

const posts = [
  {
    id: "01",
    kick: "An update from the team",
    h1: "Mainnet. <span>Coming soon.</span>",
    heads: [
      { html: "We've been <span>quiet.</span>", at: 0.6, out: 3.6 },
      { html: "Heads down. <span>Building.</span>", at: 4.1, out: 7.4 },
      { html: "Mainnet. <span>Coming soon.</span>", at: 7.9 },
    ],
    mono: "Stocks, squared. <b>Both ways.</b>",
    monoAt: 8.6,
  },
  {
    id: "02",
    kick: "Where we are",
    h1: "Heads down. <span>Shipping.</span>",
    mono: "Everything on testnet is live.<br><b>Mainnet is next.</b>",
    panel: ROAD,
  },
  {
    id: "03",
    kick: "Turn on notifications",
    h1: "More news. <span>Very soon.</span>",
    mono: "Follow <b>@ParabolNow</b> so you don't miss it.",
  },
  {
    id: "04",
    pill: "Mainnet · in development",
    kick: "Built to be right, not rushed",
    h1: "The part we <span>won't rush.</span>",
    mono: "Fully paid positions.<br>Bear² vault built to cover max value.",
    panel: {
      type: "list",
      title: "Spec sheet · Bull² and Bear²",
      fig: "From the Parabol² spec sheet",
      rows: [
        { k: "Margin", v: "None" },
        { k: "Liquidation", v: "None" },
        { k: "Expiry", v: "None" },
        { k: "Max loss", v: "Your stake" },
        { k: "Form", v: "ERC-20" },
      ],
    },
  },
  {
    id: "05",
    pill: "Testnet · open now",
    kick: "While you wait for mainnet",
    h1: "Get your reps in. <span>On testnet.</span>",
    mono: "Test tokens have no value.<br>Use a fresh wallet. <b>useparabol.com/testnet</b>",
    panel: {
      type: "list",
      title: "Robinhood Chain testnet · 46630",
      fig: "MetaMask or Phantom",
      rows: [
        { k: "01  Connect", v: "Wallet" },
        { k: "02  Gas", v: "Test ETH" },
        { k: "03  Claim", v: "1,000 tUSDG" },
        { k: "04  Pick a side", v: "Bull² / Bear²", cls: "next" },
      ],
    },
  },
  {
    id: "06",
    kick: "Status update",
    h1: "The road to <span>mainnet.</span>",
    mono: "More news <b>soon.</b>",
    panel: ROAD,
  },
  {
    id: "07",
    kick: "Good morning",
    h1: "Quiet on the timeline. <span>Busy behind it.</span>",
    mono: "Parabol² mainnet updates <b>are coming.</b>",
  },
  {
    id: "08",
    kick: "Tell us below",
    h1: "Which market <span>first?</span>",
    mono: "Five markets on testnet today.<br><b>Which one are you squaring first?</b>",
    panel: {
      type: "list",
      title: "Bear² max value by market",
      fig: "Price floor caps Bear² gains · set per market",
      rows: [
        { k: "NVDA", v: "Up to 4×" },
        { k: "TSLA", v: "Up to 4×" },
        { k: "PLTR", v: "Up to 4×" },
        { k: "AAPL", v: "Up to 2.8×" },
        { k: "SPY", v: "Up to 2×" },
      ],
    },
  },
  {
    id: "09",
    pill: "Practice demo · no wallet",
    kick: "Practice stock strategies with virtual money",
    h1: "Explore stock moves. <span>Before mainnet.</span>",
    mono: "10,000 virtual USDG. <b>useparabol.com/demo</b>",
    panel: { type: "big", n: "10,000", l: "Virtual USDG to start.<br>No wallet. No deposits.", fig: "Practice demo · virtual money only" },
  },
  {
    id: "10",
    pill: "Next stop · mainnet",
    kick: "Bull² · Bear² · no liquidations",
    h1: "Stocks, <span>squared.</span> Both ways.",
    mono: "Stay close. <b>@ParabolNow</b>",
  },
];

module.exports = { posts, ROAD };

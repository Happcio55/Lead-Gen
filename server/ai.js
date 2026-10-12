// One- or two-sentence plain-language explanation of a token's score.
// Uses Claude when ANTHROPIC_API_KEY is set, otherwise a rule-based sentence built from the top flag.
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { db } from './store.js';

const anthropic = config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey }) : null;
const inflight = new Map();

const SYSTEM = `You explain on-chain risk checks for newly launched crypto tokens on Robinhood Chain to retail traders.
Write one or two short sentences (max 45 words) in plain English. Lead with the single most important finding and say why it matters for someone thinking of buying.
Only use facts given in the input; never invent numbers. No price predictions, no advice to buy or sell, no emojis, no hype, no markdown.`;

function cacheKey(t) {
  return t.address + ':' + t.score.score + ':' + t.score.flags.map(f => f.id + f.level).join(',');
}

const RULES = {
  dev_sold: 'The creator has been selling into buyers, which usually means they are cashing out rather than building.',
  dev_selling: 'The creator has started selling part of their bag; watch whether that continues.',
  dev_holds: 'The creator still controls a large share of supply and could dump it on buyers at any time.',
  dev_spread: 'The creator moved tokens to other wallets, a common way to hide how much they really control.',
  snipers: 'Bots bought in the first seconds and still hold a big chunk, so expect them to sell into the first pump.',
  bundled: 'Several wallets bought in the same block as creation, which often means the launch was bundled by insiders.',
  concentrated: 'A handful of wallets hold most of the supply, so a single seller can move the price hard.',
  mint: 'The owner can still mint new tokens, which can dilute every holder instantly.',
  blacklist: 'The owner can block wallets from selling, the classic honeypot setup.',
  pause: 'The owner can pause trading, which would trap buyers.',
  tax: 'The owner can change the buy and sell tax after you buy.',
  proxy: 'The contract can be upgraded, so its rules could change after you buy.',
  copycat: 'This token borrows the name of something more established, a common trick to catch careless buyers.',
  low_liq: 'There is very little liquidity, so even small sells will move the price a lot.',
  sell_pressure: 'Sellers clearly outnumber buyers right now.',
  crashed: 'The price has already collapsed over the last day.',
  wash: 'Trading volume looks inflated compared with the liquidity behind it.',
  unlisted: 'It is still on its launch curve and has not reached a DEX pool yet.',
  few_holders: 'Very few wallets hold it so far.',
  too_early: 'Wait a few minutes: there isn\u2019t enough trading yet to tell whether this launch is healthy.'
};

const lc = s => s.charAt(0).toLowerCase() + s.slice(1);

function ruleBased(t) {
  const s = t.score;
  const bad = s.flags.find(f => f.level === 'bad');
  const warn = s.flags.find(f => f.level === 'warn');
  const good = s.flags.filter(f => f.level === 'ok').slice(0, 2).map(f => lc(f.text));
  if (bad) return `${bad.text}. ${RULES[bad.id] || ''}`.trim();
  if (warn && s.score >= 7) return `The launch itself looks clean (${good.join(', ') || 'no red flags'}). One thing to watch: ${RULES[warn.id] ? lc(RULES[warn.id]) : lc(warn.text) + '.'}`;
  if (warn) return `${warn.text}. ${RULES[warn.id] || ''}`.trim();
  return `Nothing alarming in the launch: ${good.join(' and ') || 'no red flags were found'}. The main risk is ordinary volatility.`;
}

async function askClaude(t) {
  const facts = {
    token: `${t.name} ($${t.symbol})`,
    age_minutes: t.createdAt ? Math.round((Date.now() - t.createdAt) / 60000) : null,
    score: `${t.score.score}/10 (${t.score.label})`,
    launch_health: `${t.score.launch}/10`,
    market_quality: `${t.score.market}/10`,
    findings: t.score.flags.map(f => `[${f.level}] ${f.text}`),
    liquidity_usd: t.market?.liquidityUsd ?? null,
    volume_24h_usd: t.market?.vol24 ?? null,
    price_change_24h_pct: t.market?.change24 ?? null
  };
  const response = await anthropic.beta.messages.create({
    model: config.aiModel,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(facts) }]
  });
  if (response.stop_reason === 'refusal') return null;
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  return text || null;
}

export async function explain(t) {
  if (!t.score) return null;
  const key = cacheKey(t);
  if (db.ai[key]) return db.ai[key];
  if (!anthropic) return ruleBased(t);
  if (inflight.has(key)) return inflight.get(key);
  const p = askClaude(t)
    .then(text => { const out = text || ruleBased(t); db.ai[key] = out; return out; })
    .catch(e => {
      if (e instanceof Anthropic.RateLimitError) console.warn('[ai] rate limited');
      else if (e instanceof Anthropic.AuthenticationError) console.warn('[ai] invalid ANTHROPIC_API_KEY');
      else if (e instanceof Anthropic.APIError) console.warn(`[ai] API error ${e.status}: ${e.message}`);
      else console.warn('[ai]', e.message);
      return ruleBased(t);
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const aiEnabled = () => Boolean(anthropic);

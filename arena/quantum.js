/* 2-qubit statevector simulator + agent strategies.
   Basis index = q1*2 + q0, so |q1 q0>: 0=|00>, 1=|01>, 2=|10>, 3=|11>. */
(function (global) {
  'use strict';

  const C = (re, im = 0) => ({ re, im });
  const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const add = (a, b) => C(a.re + b.re, a.im + b.im);

  function zero() { return [C(1), C(0), C(0), C(0)]; }

  // Apply a single-qubit 2x2 gate [[a,b],[c,d]] to qubit q.
  function apply1(state, q, g) {
    const out = state.slice();
    const bit = 1 << q;
    for (let i = 0; i < 4; i++) {
      if (i & bit) continue;
      const j = i | bit;
      const s0 = state[i], s1 = state[j];
      out[i] = add(mul(g[0], s0), mul(g[1], s1));
      out[j] = add(mul(g[2], s0), mul(g[3], s1));
    }
    return out;
  }
  const RY = (t) => [C(Math.cos(t / 2)), C(-Math.sin(t / 2)), C(Math.sin(t / 2)), C(Math.cos(t / 2))];
  const RZ = (p) => [C(Math.cos(-p / 2), Math.sin(-p / 2)), C(0), C(0), C(Math.cos(p / 2), Math.sin(p / 2))];
  const H = [C(Math.SQRT1_2), C(Math.SQRT1_2), C(Math.SQRT1_2), C(-Math.SQRT1_2)];

  function cnot(state, control, target) {
    const out = state.slice();
    const cb = 1 << control, tb = 1 << target;
    for (let i = 0; i < 4; i++) {
      if ((i & cb) && !(i & tb)) { out[i] = state[i | tb]; out[i | tb] = state[i]; }
    }
    return out;
  }

  /* Circuit used by every agent:
       q0: RY(θa) ─●──────────── RY(β) ─ M
       q1: RY(θb) ─X── RZ(φ) ─ H ─────── M
     θa: primary feature squashed into (0, π), read directly on q0
     θb: secondary feature squashed into (0, π/2); the stronger it is, the more q1 sits in
         superposition, so the H gate turns the order-flow phase into a measurable bias
     φ: order-flow phase, π × the 1h buy share (all sells = 0, all buys = π)
     β: the agent's temperament bias */
  function run(p) {
    let s = zero();
    s = apply1(s, 0, RY(p.thetaA));
    s = apply1(s, 1, RY(p.thetaB));
    s = cnot(s, 0, 1);
    s = apply1(s, 1, RZ(p.phi));
    s = apply1(s, 1, H);
    s = apply1(s, 0, RY(p.beta));
    const probs = s.map((a) => a.re * a.re + a.im * a.im);
    // |11> = conviction buy, |10> = lean buy, |01> = lean avoid, |00> = avoid
    const score = probs[3] + 0.5 * probs[2] - 0.5 * probs[1] - probs[0];
    return { state: s, probs, score };
  }

  const squash = (x, max = Math.PI) => max / (1 + Math.exp(-x)); // R → (0, max)
  const tanh = Math.tanh;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function flowRatio(t) {
    const b = t.buys1h, s = t.sells1h;
    return b + s > 0 ? b / (b + s) : 0.5;
  }

  /* Seven bots. Each persona is inspired by a language-model family; in the paper round every
     decision comes from the strategy below plus the circuit, not from the model itself.
     Order is the validated colour order (dark surface). */
  const AGENTS = [
    {
      id: 'claudius', name: 'CLAUDIUS', inspired: 'Claude', color: '#c27f12', glow: '#ffb347', style: 'Careful analyst',
      bio: 'CLAUDIUS reads the fine print. It only trades deep pools with healthy turnover and treats thin liquidity, fading volume or a bleeding chart as a hard no.',
      rules: ['stop −10%', 'take +20%', 'min $15k pool', '22% sizing'],
      w: 0.72, beta: 0.5, buyAt: 0.3, sellAt: -0.1, stop: -0.1, take: 0.2,
      classical(t) {
        if (t.liq < 15000) return -0.6;
        const depth = (Math.log10(t.liq) - 4.5) * 0.7;
        const turnover = clamp(t.vol / t.liq, 0, 4);
        const health = t.h24 > 0 ? 0.25 : -0.35;
        return clamp(tanh(depth + (turnover - 0.4) * 0.5 + health + t.h1 / 30), -1, 1);
      },
      features(t) { return { a: Math.log10(Math.max(t.liq, 1)) - 4.6, b: Math.log10(Math.max(t.vol, 1) / Math.max(t.liq, 1)) * 2 }; }
    },
    {
      id: 'gemtwins', name: 'GEMTWINS', inspired: 'Gemini', color: '#3a82c8', glow: '#7fb6ff', style: 'Two-signal consensus',
      bio: 'GEMTWINS is two minds that must agree. It ranks every token against the board on 24 hours and on 6 hours, and buys only when both twins say it is beating the pack.',
      rules: ['stop −15%', 'take +35%', 'both signals agree', '22% sizing'],
      w: 0.6, beta: 0.15, buyAt: 0.34, sellAt: -0.08, stop: -0.15, take: 0.35,
      classical(t, u) {
        const z24 = (t.h24 - u.mean24) / (u.sd24 || 1), z6 = (t.h6 - u.mean6) / (u.sd6 || 1);
        const agree = Math.sign(z24) === Math.sign(z6) ? 1 : 0.35;
        return clamp(tanh(0.6 * z24 + 0.5 * z6) * agree, -1, 1);
      },
      features(t, u) { return { a: (t.h24 - u.mean24) / (u.sd24 || 1), b: (t.h6 - u.mean6) / (u.sd6 || 1) }; }
    },
    {
      id: 'grokstar', name: 'GROKSTAR', inspired: 'Grok', color: '#d75a52', glow: '#ff8a7a', style: 'Contrarian dip buyer',
      bio: 'GROKSTAR likes it when everyone else panics. It waits for a strong 24-hour trend to dump on the hourly, then buys the dip once the sellers run out of breath.',
      rules: ['stop −14%', 'take +22%', 'buys dips only', '22% sizing'],
      w: 0.55, beta: -0.2, buyAt: 0.3, sellAt: -0.15, stop: -0.14, take: 0.22,
      classical(t) {
        const trend = tanh(t.h24 / 40);
        const dip = t.h1 < 0 ? tanh(-t.h1 / 10) : -tanh(t.h1 / 20);
        const exhaustion = (flowRatio(t) - 0.4) * 1.5;
        return clamp(trend * 0.55 + dip * 0.45 * Math.sign(trend || 1) + exhaustion * 0.2, -1, 1);
      },
      features(t) { return { a: t.h24 / 25, b: -t.h1 / 6 }; }
    },
    {
      id: 'gptony', name: 'GPTONY', inspired: 'GPT', color: '#2aa898', glow: '#5fe6d2', style: 'Momentum generalist',
      bio: 'GPTONY goes where the energy is. It weighs the 5-minute, 1-hour and 6-hour moves and acts only when buyers are actually showing up in the order flow.',
      rules: ['stop −12%', 'take +28%', 'max 4 positions', '22% sizing'],
      w: 0.62, beta: 0.35, buyAt: 0.32, sellAt: -0.12, stop: -0.12, take: 0.28,
      classical(t) {
        const mom = 0.6 * t.m5 + 1.0 * t.h1 + 0.4 * t.h6;
        const flow = (flowRatio(t) - 0.5) * 2;
        const active = t.buys1h + t.sells1h >= 5 ? 1 : 0.35;
        return clamp(tanh(mom / 18) * 0.8 * active + flow * 0.3, -1, 1);
      },
      features(t) { return { a: (t.h1 + t.m5) / 8, b: t.h6 / 15 }; }
    },
    {
      id: 'mistro', name: 'MISTRO', inspired: 'Mistral', color: '#7f6fe0', glow: '#b3a6ff', style: 'Five-minute scalper',
      bio: 'MISTRO blows in and out like the wind it is named after. It trades only fresh 5-minute bursts with live buyers, and takes small, quick profits.',
      rules: ['stop −6%', 'take +10%', '5m bursts only', '22% sizing'],
      w: 0.65, beta: 0.6, buyAt: 0.36, sellAt: -0.05, stop: -0.06, take: 0.1,
      classical(t) {
        if (t.buys1h + t.sells1h < 8) return -0.3;
        const flow = (flowRatio(t) - 0.5) * 2;
        return clamp(tanh(t.m5 / 4) * 0.75 + flow * 0.35, -1, 1);
      },
      features(t) { return { a: t.m5 / 2, b: (flowRatio(t) - 0.5) * 6 }; }
    },
    {
      id: 'llambo', name: 'LLAMBO', inspired: 'Llama', color: '#5f9a2e', glow: '#a6d96a', style: 'Volume herd follower',
      bio: 'LLAMBO runs with the herd. When a pool suddenly trades far more than its size and the hour is green, it joins the stampede.',
      rules: ['stop −13%', 'take +25%', 'turnover > 1×', '22% sizing'],
      w: 0.64, beta: 0.25, buyAt: 0.32, sellAt: -0.1, stop: -0.13, take: 0.25,
      classical(t) {
        if (t.liq < 8000) return -0.5;
        const turnover = t.vol / t.liq;
        const flow = (flowRatio(t) - 0.5) * 2;
        return clamp(tanh((turnover - 1) * 0.8) * 0.6 + tanh(t.h1 / 10) * 0.4 + flow * 0.2, -1, 1);
      },
      features(t) { return { a: (t.vol / Math.max(t.liq, 1) - 1) * 1.5, b: t.h1 / 6 }; }
    },
    {
      id: 'seeker', name: 'SEEKER', inspired: 'DeepSeek', color: '#b862bd', glow: '#f09ae6', style: 'Microcap value digger',
      bio: 'SEEKER digs where nobody looks: small market caps with real liquidity behind them, steady 6-hour strength and enough turnover to get out again.',
      rules: ['stop −15%', 'take +40%', 'mcap < $500k', '22% sizing'],
      w: 0.6, beta: -0.1, buyAt: 0.3, sellAt: -0.12, stop: -0.15, take: 0.4,
      classical(t) {
        if (t.liq < 5000) return -0.5;
        const small = t.mcap > 0 && t.mcap < 5e5 ? 0.4 : -0.3;
        const backing = t.mcap > 0 ? tanh((t.liq / t.mcap) * 3) * 0.3 : 0;
        return clamp(small + backing + tanh(t.h6 / 20) * 0.3 + tanh((t.vol / t.liq - 0.5)) * 0.15, -1, 1);
      },
      features(t) { return { a: t.mcap > 0 ? 5.7 - Math.log10(t.mcap) : -1, b: t.h6 / 12 }; }
    }
  ];

  function universeStats(tokens) {
    const st = (k) => {
      const xs = tokens.map((t) => t[k]).filter(Number.isFinite);
      const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1));
      return [m, sd];
    };
    const [mean24, sd24] = st('h24');
    const [mean6, sd6] = st('h6');
    return { mean24, sd24, mean6, sd6 };
  }

  function circuitParams(agent, t, u) {
    const f = agent.features(t, u);
    return {
      thetaA: squash(f.a),
      thetaB: squash(f.b, Math.PI / 2),
      phi: flowRatio(t) * Math.PI,
      beta: agent.beta
    };
  }

  function evaluate(agent, t, u, override) {
    const params = override || circuitParams(agent, t, u);
    const q = run(params);
    const c = agent.classical(t, u);
    const score = agent.w * c + (1 - agent.w) * q.score;
    return { score, classical: c, quantum: q.score, probs: q.probs, state: q.state, params };
  }

  global.Q = { run, evaluate, circuitParams, universeStats, AGENTS, flowRatio };
})(window);

// Runs JavaScript and Python snippets in Web Workers, so a runaway loop can be stopped without
// freezing the page. Python uses Pyodide, loaded from a CDN the first time it is needed.

const JS_TIMEOUT_MS = 5000;
const PY_TIMEOUT_MS = 20000;
const PY_LOAD_TIMEOUT_MS = 90000;
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

const JS_WORKER = `
const fmt = (v) => {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x + 'n' : x, 2) ?? String(v); } catch { return String(v); }
};
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => postMessage({ type: 'out', level, text: args.map(fmt).join(' ') });
}
onmessage = async (e) => {
  try {
    const result = await (0, eval)('(async () => {\\n' + e.data + '\\n})()');
    if (result !== undefined) postMessage({ type: 'out', level: 'result', text: fmt(result) });
    postMessage({ type: 'done' });
  } catch (err) {
    postMessage({ type: 'out', level: 'error', text: String(err && err.stack || err) });
    postMessage({ type: 'done', failed: true });
  }
};`;

const PY_WORKER = `
importScripts('${PYODIDE}pyodide.js');
const ready = loadPyodide({ indexURL: '${PYODIDE}' }).then((py) => {
  py.setStdout({ batched: (text) => postMessage({ type: 'out', level: 'log', text }) });
  py.setStderr({ batched: (text) => postMessage({ type: 'out', level: 'error', text }) });
  return py;
});
onmessage = async (e) => {
  try {
    const py = await ready;
    postMessage({ type: 'ready' });
    await py.loadPackagesFromImports(e.data);
    const result = await py.runPythonAsync(e.data);
    if (result !== undefined && result !== null) postMessage({ type: 'out', level: 'result', text: String(result) });
    postMessage({ type: 'done' });
  } catch (err) {
    postMessage({ type: 'out', level: 'error', text: String(err && err.message || err) });
    postMessage({ type: 'done', failed: true });
  }
};`;

let pyWorker = null;
let pyLoaded = false;

function workerFrom(source) {
  return new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
}

export function canRun(lang) {
  return ['js', 'javascript', 'mjs', 'python', 'py'].includes((lang || '').toLowerCase());
}

// onOutput({ level, text }) is called for each line; resolves when the run finishes or times out.
export function run(lang, code, onOutput, onStatus = () => {}) {
  const isPy = ['python', 'py'].includes(lang.toLowerCase());
  return new Promise((resolve) => {
    let worker;
    if (isPy) {
      pyWorker ??= workerFrom(PY_WORKER);
      worker = pyWorker;
      if (!pyLoaded) onStatus('Loading Python (first run only)…');
    } else {
      worker = workerFrom(JS_WORKER);
    }

    let timer = null;
    const arm = (ms = isPy ? PY_TIMEOUT_MS : JS_TIMEOUT_MS) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        onOutput({ level: 'error', text: `Stopped after ${ms / 1000} s.` });
        worker.terminate();
        if (isPy) { pyWorker = null; pyLoaded = false; }
        finish(true);
      }, ms);
    };
    const finish = (failed) => {
      clearTimeout(timer);
      worker.onmessage = null;
      if (!isPy) worker.terminate();
      resolve({ failed });
    };

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        if (!pyLoaded) { pyLoaded = true; onStatus('Running…'); arm(); }
      } else if (msg.type === 'out') onOutput(msg);
      else if (msg.type === 'done') finish(msg.failed);
    };
    worker.onerror = (e) => {
      onOutput({ level: 'error', text: e.message || 'The runner failed to start.' });
      if (isPy) { pyWorker = null; pyLoaded = false; }
      finish(true);
    };
    // Pyodide's first download can take a while, so it gets its own, longer limit.
    arm(isPy && !pyLoaded ? PY_LOAD_TIMEOUT_MS : undefined);
    worker.postMessage(code);
  });
}

// The chat panel used by the playground and by the embeddable widget.
// It streams answers from /api/chat, renders Markdown with code blocks, and runs JS/Python snippets.
import { canRun, run } from './runner.js';

const config = window.VEKTOR_CONFIG || {};
const API = (config.apiBase || '').replace(/\/$/, '');

export const MODES = [
  { id: 'code', label: 'Code', hint: 'Write a debounce function in TypeScript' },
  { id: 'fix', label: 'Fix', hint: 'Fix: for i in range(10) print(i)' },
  { id: 'explain', label: 'Explain', hint: 'Explain what Array.prototype.reduce does' },
  { id: 'solidity', label: 'Solidity', hint: 'Write a minimal ERC20 token named Vektor' },
  { id: 'translate', label: 'Translate', hint: 'Translate to Rust: def add(a, b): return a + b' },
];

const LANG_ALIASES = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', sol: 'solidity', rs: 'rust' };
const EXT = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', solidity: 'sol', rust: 'rs', go: 'go', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', ruby: 'rb', php: 'php', html: 'html', css: 'css', json: 'json', sql: 'sql', yaml: 'yml', kotlin: 'kt', swift: 'swift' };

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Splits Markdown into prose and fenced code. An unclosed fence (mid-stream) still renders as code.
export function parseBlocks(md) {
  const out = [];
  let prose = [];
  let code = null;
  const flush = () => {
    if (prose.length) out.push({ type: 'prose', text: prose.join('\n') });
    prose = [];
  };
  for (const line of md.split('\n')) {
    const fence = line.match(/^\s*```\s*([\w+#.-]*)/);
    if (code) {
      if (fence && !fence[1]) {
        out.push({ ...code, code: code.lines.join('\n'), closed: true });
        code = null;
      } else code.lines.push(line);
    } else if (fence) {
      flush();
      const raw = fence[1].toLowerCase();
      code = { type: 'code', lang: LANG_ALIASES[raw] || raw || 'text', lines: [] };
    } else prose.push(line);
  }
  if (code) out.push({ ...code, code: code.lines.join('\n'), closed: false });
  flush();
  return out.map(({ lines, ...b }) => b);
}

function proseHtml(text) {
  const html = [];
  let list = null;
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      list ??= [];
      list.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    if (list) { html.push(`<ul>${list.join('')}</ul>`); list = null; }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) html.push(`<p class="md-h">${inline(h[1])}</p>`);
    else if (line.trim()) html.push(`<p>${inline(line)}</p>`);
  }
  if (list) html.push(`<ul>${list.join('')}</ul>`);
  return html.join('');
}

function highlight(code, lang) {
  const hljs = window.hljs;
  if (hljs) {
    try {
      if (hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      if (lang === 'solidity') return hljs.highlight(code, { language: 'javascript', ignoreIllegals: true }).value;
    } catch { /* fall through to plain text */ }
  }
  return escapeHtml(code);
}

function codeBlock(block, index) {
  const runnable = block.closed && canRun(block.lang);
  return `<figure class="code" data-index="${index}">
    <figcaption>
      <span class="code-lang">${escapeHtml(block.lang)}</span>
      <span class="code-actions">
        ${runnable ? '<button type="button" data-act="run" class="code-btn code-run">▶ Run</button>' : ''}
        <button type="button" data-act="save" class="code-btn">Save</button>
        <button type="button" data-act="copy" class="code-btn">Copy</button>
      </span>
    </figcaption>
    <pre><code class="hljs">${highlight(block.code, block.lang)}</code></pre>
    <output class="code-out" hidden></output>
  </figure>`;
}

export function renderMarkdown(md) {
  return parseBlocks(md).map((b, i) => (b.type === 'code' ? codeBlock(b, i) : proseHtml(b.text))).join('');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function flash(button, text, ms = 1400) {
  const before = button.textContent;
  button.textContent = text;
  button.disabled = true;
  setTimeout(() => { button.textContent = before; button.disabled = false; }, ms);
}
export { copyText };

// Reads a server-sent-event stream of JSON events.
async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (data) yield JSON.parse(data);
    }
  }
}

/**
 * Mounts a chat into `root`. Options:
 *   mode: initial mode id, compact: smaller layout for the widget,
 *   onStats({ tokens, ms }): called after each answer.
 */
export function createChat(root, { mode = 'code', compact = false, onStats = () => {} } = {}) {
  const history = [];
  const sources = new WeakMap(); // assistant bubble → its raw Markdown
  let busy = null;

  root.classList.add('chat');
  if (compact) root.classList.add('chat--compact');
  root.innerHTML = `
    <div class="chat-modes" role="tablist" aria-label="Mode">
      ${MODES.map((m) => `<button type="button" role="tab" class="chat-mode" data-mode="${m.id}">${m.label}</button>`).join('')}
    </div>
    <div class="chat-log" aria-live="polite">
      <div class="chat-empty">
        <p class="chat-empty-title">Ask for code. Get code.</p>
        <div class="chat-chips"></div>
      </div>
    </div>
    <form class="chat-form">
      <textarea class="chat-input" rows="1" placeholder="Ask for a snippet, a fix or a contract…" aria-label="Message"></textarea>
      <div class="chat-bar">
        <span class="chat-meta"><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line</span>
        <span class="chat-bar-actions">
          <button type="button" class="chat-reset" hidden>New chat</button>
          <button type="submit" class="chat-send" aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </span>
      </div>
    </form>`;

  const $ = (s) => root.querySelector(s);
  const log = $('.chat-log');
  const empty = $('.chat-empty');
  const input = $('.chat-input');
  const form = $('.chat-form');
  const send = $('.chat-send');
  const reset = $('.chat-reset');

  function setMode(id) {
    mode = MODES.some((m) => m.id === id) ? id : 'code';
    root.querySelectorAll('.chat-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    const current = MODES.find((m) => m.id === mode);
    input.placeholder = compact ? 'Ask for code…' : `${current.hint}…`;
    $('.chat-chips').innerHTML = MODES.map((m) => `<button type="button" class="chat-chip" data-mode="${m.id}" data-prompt="${escapeHtml(m.hint)}"><span>${m.label}</span>${escapeHtml(m.hint)}</button>`).join('');
  }
  setMode(mode);

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, compact ? 120 : 220)}px`;
  }

  function scrollDown() {
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
    if (near) log.scrollTop = log.scrollHeight;
  }

  function addBubble(role, html = '') {
    empty.hidden = true;
    const el = document.createElement('div');
    el.className = `msg msg--${role}`;
    el.innerHTML = role === 'user' ? `<div class="msg-body">${html}</div>` : `
      <details class="msg-think" hidden><summary><span class="pulse"></span><span class="msg-think-label">Thinking</span></summary><div class="msg-think-body"></div></details>
      <div class="msg-body"><span class="typing"><i></i><i></i><i></i></span></div>
      <div class="msg-foot" hidden></div>`;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function ask(text) {
    if (busy || !text.trim()) return;
    history.push({ role: 'user', content: text.trim() });
    addBubble('user', escapeHtml(text.trim()).replace(/\n/g, '<br>'));
    const bubble = addBubble('assistant');
    const body = bubble.querySelector('.msg-body');
    const think = bubble.querySelector('.msg-think');
    const thinkBody = bubble.querySelector('.msg-think-body');
    const foot = bubble.querySelector('.msg-foot');

    input.value = '';
    autosize();
    busy = new AbortController();
    root.classList.add('is-busy');
    reset.hidden = false;

    let answer = '';
    let thought = '';
    const started = performance.now();
    let frame = 0;
    const paint = () => {
      frame = 0;
      sources.set(bubble, answer);
      body.innerHTML = renderMarkdown(answer) || '<span class="typing"><i></i><i></i><i></i></span>';
      scrollDown();
    };

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, messages: history }),
        signal: busy.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status}).`);
      }
      let done = null;
      for await (const ev of readEvents(res)) {
        if (ev.type === 'text') {
          answer += ev.text;
          if (!think.hidden) think.querySelector('.msg-think-label').textContent = 'Reasoning';
          frame ||= requestAnimationFrame(paint);
        } else if (ev.type === 'thinking') {
          thought += ev.text;
          think.hidden = false;
          thinkBody.textContent = thought;
        } else if (ev.type === 'notice') {
          answer += `\n\n_${ev.text}_`;
        } else if (ev.type === 'error') {
          throw new Error(ev.text);
        } else if (ev.type === 'done') {
          done = ev;
        }
      }
      cancelAnimationFrame(frame);
      paint();
      think.querySelector('.msg-think-label').textContent = 'Reasoning';
      think.classList.add('is-done');
      if (answer) history.push({ role: 'assistant', content: answer });
      else history.pop();
      const ms = Math.round(performance.now() - started);
      if (done) {
        foot.hidden = false;
        foot.textContent = `${(ms / 1000).toFixed(1)} s · ${done.usage.output.toLocaleString('en')} tokens`;
        onStats({ tokens: done.usage.output, ms });
      }
    } catch (err) {
      cancelAnimationFrame(frame);
      if (err.name === 'AbortError') {
        if (answer) { paint(); history.push({ role: 'assistant', content: answer }); }
        else { bubble.remove(); history.pop(); }
      } else {
        history.pop();
        if (answer) paint();
        body.insertAdjacentHTML('beforeend', `<p class="msg-error">${escapeHtml(err.message || 'Something went wrong.')}</p>`);
      }
    } finally {
      busy = null;
      root.classList.remove('is-busy');
      if (think.hidden === false && !thought) think.hidden = true;
    }
  }

  // Code block buttons: copy, save as a file, run.
  log.addEventListener('click', async (e) => {
    const button = e.target.closest('.code-btn');
    if (!button) return;
    const fig = button.closest('.code');
    const block = parseBlocks(sources.get(fig.closest('.msg')) ?? '')[Number(fig.dataset.index)];
    const code = block?.code ?? fig.querySelector('code').textContent;
    const lang = block?.lang ?? 'text';

    if (button.dataset.act === 'copy') {
      flash(button, (await copyText(code)) ? 'Copied' : 'Failed');
    } else if (button.dataset.act === 'save') {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      Object.assign(document.createElement('a'), { href: url, download: `vektor.${EXT[lang] || 'txt'}` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (button.dataset.act === 'run') {
      const out = fig.querySelector('.code-out');
      out.hidden = false;
      out.innerHTML = '';
      button.disabled = true;
      const line = (level, text) => {
        const row = document.createElement('div');
        row.className = `out out--${level}`;
        row.textContent = text;
        out.append(row);
      };
      const status = (text) => line('status', text);
      const result = await run(lang, code, ({ level, text }) => line(level, text), status);
      out.querySelectorAll('.out--status').forEach((r) => r.remove());
      if (!out.childElementCount) line('status', result.failed ? 'Failed with no output.' : 'Finished with no output.');
      button.disabled = false;
    }
  });

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('.chat-mode');
    if (tab) setMode(tab.dataset.mode);
    const chip = e.target.closest('.chat-chip');
    if (chip) {
      setMode(chip.dataset.mode);
      ask(chip.dataset.prompt);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) busy.abort();
    else ask(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!busy) ask(input.value);
    }
  });
  input.addEventListener('input', autosize);
  reset.addEventListener('click', () => {
    busy?.abort();
    history.length = 0;
    log.querySelectorAll('.msg').forEach((m) => m.remove());
    empty.hidden = false;
    reset.hidden = true;
    input.focus();
  });

  return {
    ask,
    setMode,
    focus: () => input.focus(),
    get busy() { return Boolean(busy); },
  };
}

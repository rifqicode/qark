#!/usr/bin/env node
// Runs a CLI command (e.g. the test suite) and records a Playwright video of its LIVE output.
//
//   node record-cli.mjs --out <dir>/Q-02-after [--cwd <dir>] [--timeout 600000] -- npm test
//
// The command runs for real; its stdout/stderr stream into a terminal-style page that Playwright records.
// This is a rendering of the actual output, not a capture of a real TTY (colors via FORCE_COLOR, no cursor
// control). The raw text log and the exit code are the authoritative evidence; the video makes them auditable.
// Outputs: <out>.webm, <out>.log (raw output), <out>.json (command, exit code, timing).
// Exit: the command's exit code (124 on timeout, 127 if it could not start), 3 Playwright unavailable, 2 bad usage.
import { mkdirSync, mkdtempSync, renameSync, copyFileSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadPlaywright, parseArgs, SETUP_HINT } from './lib.mjs';

const { flags, rest } = parseArgs(process.argv.slice(2));
if (!flags.out || flags.out === true || rest.length === 0) {
  console.error('Usage: record-cli.mjs --out <path-without-extension> [--cwd DIR] [--timeout MS] [--width 1280] [--height 720] -- <command> [args...]');
  process.exit(2);
}
const pw = await loadPlaywright();
if (!pw) { console.error(SETUP_HINT); process.exit(3); }

const out = resolve(flags.out);
const cwd = resolve(typeof flags.cwd === 'string' ? flags.cwd : process.cwd());
const timeoutMs = Number(flags.timeout || 600000);
const width = Number(flags.width || 1280);
const height = Number(flags.height || 720);
mkdirSync(dirname(out), { recursive: true });
const tmp = mkdtempSync(resolve(dirname(out), '.rec-'));

const FG = ['#3b4252', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d8dee9'];
const FG_BRIGHT = ['#6b7385', '#ff7b86', '#b5e890', '#ffd68a', '#7ab8ff', '#e08cff', '#6fd3e0', '#ffffff'];
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Minimal stateful ANSI SGR -> HTML. Other escape sequences are dropped; lone CR is ignored.
function createAnsiRenderer() {
  let color = null;
  let bold = false;
  let carry = '';
  return chunk => {
    let text = carry + chunk;
    carry = '';
    const partial = text.match(/\x1b(\[[0-9;?]*)?$/);
    if (partial) { carry = partial[0]; text = text.slice(0, -partial[0].length); }
    let html = '';
    const emit = segment => {
      if (!segment) return;
      const body = escapeHtml(segment);
      html += color || bold ? '<span style="' + (color ? 'color:' + color + ';' : '') + (bold ? 'font-weight:700' : '') + '">' + body + '</span>' : body;
    };
    const pattern = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b[^[]|\r(?!\n)/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text))) {
      emit(text.slice(last, match.index));
      last = pattern.lastIndex;
      if (match[2] !== 'm') continue;
      for (const code of (match[1] || '0').split(';').map(Number)) {
        if (code === 0) { color = null; bold = false; }
        else if (code === 1) bold = true;
        else if (code === 22) bold = false;
        else if (code === 39) color = null;
        else if (code >= 30 && code <= 37) color = FG[code - 30];
        else if (code >= 90 && code <= 97) color = FG_BRIGHT[code - 90];
      }
    }
    emit(text.slice(last));
    return html;
  };
}

const browser = await pw.chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, recordVideo: { dir: tmp, size: { width, height } } });
const page = await context.newPage();
const command = rest.join(' ');
await page.setContent('<!doctype html><meta charset="utf-8"><style>' +
  'html,body{margin:0;background:#1e2127;color:#d8dee9;font:14px/1.45 ui-monospace,Menlo,Consolas,"DejaVu Sans Mono",monospace}' +
  '#bar{position:sticky;top:0;background:#2b2f38;padding:8px 14px;color:#9aa5b8;border-bottom:1px solid #3a3f4b}' +
  '#t{margin:0;padding:12px 14px;white-space:pre-wrap;word-break:break-word}</style>' +
  '<div id="bar"></div><pre id="t"></pre>');
await page.evaluate(([cmd, dir]) => { document.getElementById('bar').textContent = dir + ' $ ' + cmd; }, [command, cwd]);

let chain = Promise.resolve();
const push = html => {
  chain = chain.then(() => page.evaluate(h => {
    document.getElementById('t').insertAdjacentHTML('beforeend', h);
    window.scrollTo(0, document.body.scrollHeight);
  }, html)).catch(() => {});
};
const render = createAnsiRenderer();
const log = createWriteStream(out + '.log');
const started = Date.now();
let timedOut = false;
let startError = null;

const exit = await new Promise(done => {
  const child = spawn(rest[0], rest.slice(1), { cwd, env: { ...process.env, FORCE_COLOR: '1' }, shell: false });
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }, timeoutMs);
  const onData = chunk => { const text = chunk.toString('utf8'); log.write(text); push(render(text)); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', error => { startError = error.message; clearTimeout(timer); done({ code: 127, signal: null }); });
  child.on('close', (code, signal) => { clearTimeout(timer); done({ code, signal }); });
});

const exitCode = timedOut ? 124 : (exit.code ?? 1);
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const status = startError ? 'could not start: ' + startError : timedOut ? 'TIMEOUT after ' + seconds + 's' : 'exit code ' + exitCode + ' in ' + seconds + 's';
if (startError) { log.write(status + '\n'); push(escapeHtml(status) + '\n'); }
push('\n<span style="color:' + (exitCode === 0 ? '#98c379' : '#e06c75') + ';font-weight:700">[' + escapeHtml(status) + ']</span>\n');
await chain;
await page.waitForTimeout(1500);
await new Promise(done => log.end(done));

const video = page.video();
await context.close();
await browser.close();
const recorded = await video.path();
const videoPath = out + '.webm';
try { renameSync(recorded, videoPath); } catch { copyFileSync(recorded, videoPath); }
rmSync(tmp, { recursive: true, force: true });

const result = { kind: 'cli', command: rest, cwd, exitCode, signal: exit.signal, timedOut, startError, durationMs: Date.now() - started, video: videoPath, log: out + '.log' };
writeFileSync(out + '.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ exitCode, video: videoPath, log: out + '.log', result: out + '.json' }));
process.exit(exitCode);

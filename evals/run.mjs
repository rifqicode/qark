#!/usr/bin/env node
// Behavioral evals: does Qark activate when it should, stay quiet when it should, and route correctly?
// Each case runs ONE prompt headlessly in a throwaway copy of the fixture project with the local checkout
// loaded as a plugin, then inspects the tool calls. This makes real model calls (cost + time), so it only
// executes with --run; without it the runner lists what it would do.
//
//   node evals/run.mjs                          list cases (dry run)
//   node evals/run.mjs --run                    run all cases
//   node evals/run.mjs --run --case fast-label,neg-capital --repeat 3
//   node evals/run.mjs --run --type negative
//
// Flags: --host claude (only supported host) --timeout <ms, default 240000> --keep (keep temp dirs)
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeStream, scoreCase, summarize } from './analyze.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : (args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : true);
};

const host = flag('--host', 'claude');
if (host !== 'claude') {
  console.error('Unsupported --host ' + host + '. Only "claude" is implemented (Codex/Antigravity transcripts are not parsed yet).');
  process.exit(2);
}
const execute = args.includes('--run');
const timeout = Number(flag('--timeout', 240000));
const repeat = Math.max(1, Number(flag('--repeat', 1)));
const wantedIds = flag('--case') && flag('--case') !== true ? String(flag('--case')).split(',') : null;
const wantedType = flag('--type');
const keep = args.includes('--keep');

const suite = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const cases = suite.cases.filter(c => (!wantedIds || wantedIds.includes(c.id)) && (!wantedType || c.type === wantedType));
if (wantedIds) {
  const unknown = wantedIds.filter(id => !suite.cases.some(c => c.id === id));
  if (unknown.length) { console.error('Unknown case id(s): ' + unknown.join(', ')); process.exit(2); }
}
if (!cases.length) { console.error('No cases selected.'); process.exit(2); }

const claudeArgs = prompt => ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
  '--plugin-dir', root, '--add-dir', root, '--permission-mode', 'acceptEdits'];
// Never let an eval run spawn Herdr panes or control the user's Herdr session.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('HERDR_')));

if (!execute) {
  console.log('Dry run: ' + cases.length + ' case(s) x ' + repeat + ' = ' + cases.length * repeat + ' model call(s) would be made. Add --run to execute.\n');
  for (const c of cases) console.log(c.id.padEnd(18) + c.type.padEnd(10) + ' expect ' + JSON.stringify(c.expect) + '\n  ' + c.prompt);
  console.log('\nCommand per case: claude ' + claudeArgs('<prompt>').join(' ') + '   (cwd: temp copy of evals/fixtures/shop-app, HERDR_* removed)');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const transcriptDir = join(here, 'results', stamp);
mkdirSync(transcriptDir, { recursive: true });
const rows = [];
for (const c of cases) {
  const row = { id: c.id, type: c.type, prompt: c.prompt, expect: c.expect, runs: [] };
  for (let attempt = 1; attempt <= repeat; attempt++) {
    const work = mkdtempSync(join(tmpdir(), 'evalrun-'));
    cpSync(join(here, 'fixtures', 'shop-app'), work, { recursive: true });
    const started = Date.now();
    const proc = spawnSync('claude', claudeArgs(c.prompt), { cwd: work, env, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 * 1024 });
    const timedOut = proc.error?.code === 'ETIMEDOUT';
    writeFileSync(join(transcriptDir, c.id + '-' + attempt + '.jsonl'), proc.stdout ?? '');
    const observed = analyzeStream(proc.stdout ?? '');
    const score = scoreCase(c.expect, observed);
    const run = { attempt, pass: score.pass && !(proc.error && !timedOut), failures: score.failures, timedOut, error: proc.error && !timedOut ? proc.error.message : null, seconds: Math.round((Date.now() - started) / 1000), observed };
    row.runs.push(run);
    console.log((run.pass ? 'PASS ' : 'FAIL ') + c.id.padEnd(18) + ' [' + attempt + '/' + repeat + '] ' + run.seconds + 's' +
      (timedOut ? ' TIMEOUT' : '') + (observed.costUsd != null ? ' $' + observed.costUsd.toFixed(3) : '') +
      (run.failures.length ? '\n       ' + run.failures.join('; ') : ''));
    if (keep) console.log('       kept ' + work); else rmSync(work, { recursive: true, force: true });
  }
  rows.push(row);
}

const summary = summarize(rows);
const pct = value => (value == null ? 'n/a' : Math.round(value * 100) + '%');
const failedCases = rows.filter(row => row.runs.some(run => !run.pass));
console.log('\nTrigger accuracy      ' + pct(summary.triggerAccuracy) + ' (' + summary.triggerHits + '/' + summary.triggerTotal + ')  qark read when expected');
console.log('False-positive rate   ' + pct(summary.falsePositiveRate) + ' (' + summary.falsePositives + '/' + summary.negativeTotal + ')  qark read when it should stay out');
console.log('Edit behavior         ' + pct(summary.editBehaviorAccuracy) + ' (' + summary.editHits + '/' + summary.editTotal + ')  edited / did not edit as expected');
console.log('Cases failed          ' + failedCases.length + '/' + rows.length);

const outFile = join(here, 'results', stamp + '.json');
writeFileSync(outFile, JSON.stringify({ host, repeat, ranAt: new Date().toISOString(), summary, rows }, null, 2) + '\n');
console.log('Details: ' + outFile + '\nTranscripts: ' + transcriptDir);
process.exit(failedCases.length ? 1 : 0);

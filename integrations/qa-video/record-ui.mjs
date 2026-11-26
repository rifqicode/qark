#!/usr/bin/env node
// Runs a Playwright scenario script with video recording. Run the SAME script against the baseline and the
// changed build to get comparable before/after videos.
//
//   node record-ui.mjs --script scenario.mjs --base-url http://localhost:3000 --out <dir>/Q-01-after
//
// scenario.mjs:  export default async ({ page, context, baseUrl }) => { ...; throw on failed assertion }
// Outputs: <out>.webm, <out>.json, and <out>-failure.png when the scenario throws.
// Exit: 0 scenario passed, 1 scenario failed, 3 Playwright unavailable, 2 bad usage.
import { mkdirSync, mkdtempSync, renameSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlaywright, parseArgs, SETUP_HINT } from './lib.mjs';

const { flags } = parseArgs(process.argv.slice(2));
if (!flags.script || !flags.out || flags.script === true || flags.out === true) {
  console.error('Usage: record-ui.mjs --script <scenario.mjs> --out <path-without-extension> [--base-url URL] [--width 1280] [--height 720]');
  process.exit(2);
}
const pw = await loadPlaywright();
if (!pw) { console.error(SETUP_HINT); process.exit(3); }

const out = resolve(flags.out);
const width = Number(flags.width || 1280);
const height = Number(flags.height || 720);
const baseUrl = typeof flags['base-url'] === 'string' ? flags['base-url'] : '';
mkdirSync(dirname(out), { recursive: true });
const tmp = mkdtempSync(resolve(dirname(out), '.rec-'));

const browser = await pw.chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, recordVideo: { dir: tmp, size: { width, height } } });
const page = await context.newPage();
const started = Date.now();
let ok = true;
let error = null;
try {
  const mod = await import(pathToFileURL(resolve(flags.script)).href);
  const run = mod.default ?? mod.run;
  if (typeof run !== 'function') throw new Error('Scenario must export a default async function ({ page, context, baseUrl })');
  await run({ page, context, baseUrl });
  await page.waitForTimeout(800);
} catch (e) {
  ok = false;
  error = e?.stack ?? String(e);
  try { await page.screenshot({ path: out + '-failure.png' }); } catch { /* page may be gone */ }
}
const video = page.video();
await context.close();
await browser.close();
const recorded = await video.path();
const videoPath = out + '.webm';
try { renameSync(recorded, videoPath); } catch { copyFileSync(recorded, videoPath); }
rmSync(tmp, { recursive: true, force: true });

const result = { kind: 'ui', script: resolve(flags.script), baseUrl, ok, error, durationMs: Date.now() - started, video: videoPath, viewport: { width, height } };
writeFileSync(out + '.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ok, video: videoPath, result: out + '.json', error: error ? error.split('\n')[0] : null }));
process.exit(ok ? 0 : 1);

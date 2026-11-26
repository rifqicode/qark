// Shared helpers for the QA video tools. Playwright lives in an isolated runtime dir, never in the target project.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const runtimeDir = process.env.QARK_QA_HOME || join(homedir(), '.cache', 'qark', 'qa-video');
export const SETUP_HINT = 'Playwright is not available. Ask the user to approve, then run: node <qark>/integrations/setup.mjs --only qa-video --yes';

export async function loadPlaywright() {
  for (const base of [join(runtimeDir, 'package.json'), join(process.cwd(), 'package.json')]) {
    try {
      const mod = await import(pathToFileURL(createRequire(base).resolve('playwright')).href);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return { chromium, base };
    } catch { /* try next location */ }
  }
  return null;
}

// Reports whether recording works: package resolvable AND a headless Chromium actually launches.
export async function probeQaVideo() {
  const pw = await loadPlaywright();
  if (!pw) return { ok: false, reason: 'playwright package not found' };
  try {
    const browser = await pw.chromium.launch();
    await browser.close();
  } catch (error) {
    const message = String(error.message);
    const missing = /doesn't exist/.test(message);
    return { ok: false, reason: missing ? 'Chromium browser is not installed for this Playwright version' : 'Chromium failed to launch: ' + message.split('\n')[0], launchFailure: !missing };
  }
  return { ok: true };
}

export const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

export function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { rest.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[arg.slice(2)] = true;
      else { flags[arg.slice(2)] = next; i++; }
    } else rest.push(arg);
  }
  return { flags, rest };
}

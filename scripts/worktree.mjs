#!/usr/bin/env node
// Deterministic git worktree helper for the Orchestrator. Zero dependencies.
// Heavy package folders are symlinked from the main checkout so they are never installed twice.
//
//   node scripts/worktree.mjs detect  [--repo <dir>]
//   node scripts/worktree.mjs create  --name <slug> [--branch <b>] [--base <ref>] [--path <dir>] [--repo <dir>]
//                                     [--link a,b] [--copy a,b] [--save-config] [--dry-run]
//   node scripts/worktree.mjs check   --path <dir> [--branch <b>] [--repo <dir>]
//   node scripts/worktree.mjs unlink  --path <dir> [--only a,b] [--empty] [--repo <dir>]
//   node scripts/worktree.mjs remove  --path <dir> [--force] [--repo <dir>]
//
// Config (local, never committed): <main-repo>/.ai/worktree.json
//   { "link": ["node_modules"], "copy": [".env"], "postCreate": ["<shell command>"] }
// link = symlinked from the main checkout; copy = copied once (secrets, per-tree files);
// postCreate = shell commands run in the new worktree (runs only what the local config lists).
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, symlinkSync, unlinkSync,
  readlinkSync, realpathSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve, basename, isAbsolute, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const [cmd, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) fail('unexpected argument: ' + rest[i]);
  const key = rest[i].slice(2);
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) opts[key] = true;
  else { opts[key] = next; i++; }
}
const dry = opts['dry-run'] === true;
const list = v => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : null);

function fail(msg) { console.error('worktree: ' + msg); process.exit(1); }
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function mustGit(args, cwd) {
  const r = git(args, cwd);
  if (!r.ok) fail('git ' + args.join(' ') + ': ' + r.err);
  return r.out;
}

// The main checkout is always the first entry of `git worktree list`, even when run from a linked worktree.
function mainRepo() {
  const from = resolve(typeof opts.repo === 'string' ? opts.repo : process.cwd());
  const porcelain = mustGit(['worktree', 'list', '--porcelain'], from);
  const first = porcelain.split('\n').find(l => l.startsWith('worktree '));
  if (!first) fail('not inside a git repository: ' + from);
  return first.slice('worktree '.length);
}
const main = mainRepo();
const configPath = resolve(main, '.ai/worktree.json');
const isLink = p => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
const present = p => { try { lstatSync(p); return true; } catch { return false; } };

function safeEntry(e) {
  if (isAbsolute(e) || e.split(/[\\/]/).includes('..') || e === '.' || e === '') fail('unsafe entry (must be a relative path inside the repo): ' + e);
  return e.replace(/\\/g, '/').replace(/\/+$/, '');
}
function loadConfig() {
  const cfg = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  return { link: cfg.link || [], copy: cfg.copy || [], postCreate: cfg.postCreate || [], exists: existsSync(configPath) };
}
function detect() {
  const link = ['node_modules', 'vendor', '.venv', 'venv'].filter(e => present(resolve(main, e)));
  const copy = ['.env', '.env.local'].filter(e => present(resolve(main, e)));
  return { link, copy, postCreate: [] };
}
function excludeFile() {
  // --git-common-dir is shared by all linked worktrees; resolve against main because older git prints it relative.
  return resolve(main, mustGit(['rev-parse', '--git-common-dir'], main), 'info/exclude');
}
function addExclude(lines) {
  const file = excludeFile();
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const missing = lines.filter(l => !current.split('\n').includes(l));
  if (!missing.length || dry) return missing;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, (current && !current.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
  return missing;
}
const wtPath = () => {
  if (typeof opts.path !== 'string') fail('--path is required');
  return resolve(opts.path);
};

function create() {
  const name = opts.name;
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) fail('--name must be a lowercase slug like login-otp');
  const path = typeof opts.path === 'string' ? resolve(opts.path) : resolve(dirname(main), basename(main) + '.worktrees', name);
  const branch = typeof opts.branch === 'string' ? opts.branch : 'feat/' + name;
  const base = typeof opts.base === 'string' ? opts.base : mustGit(['rev-parse', '--abbrev-ref', 'HEAD'], main);
  if (base === 'HEAD') fail('main checkout is on a detached HEAD; pass --base <ref>');
  if (existsSync(path)) fail('path already exists: ' + path);
  if (relative(main, path) && !relative(main, path).startsWith('..')) fail('worktree path must be outside the main checkout: ' + path);
  if (git(['rev-parse', '--verify', '--quiet', 'refs/heads/' + branch], main).ok) fail('branch already exists: ' + branch + ' (choose another name or branch)');
  const inUse = mustGit(['worktree', 'list', '--porcelain'], main).includes('branch refs/heads/' + branch);
  if (inUse) fail('branch is checked out in another worktree: ' + branch);

  const cfg = loadConfig();
  const link = (list(opts.link) || (cfg.exists ? cfg.link : detect().link)).map(safeEntry);
  const copy = (list(opts.copy) || (cfg.exists ? cfg.copy : detect().copy)).map(safeEntry);
  const post = cfg.postCreate;

  console.log((dry ? '[dry-run] ' : '') + 'create worktree ' + path + ' on new branch ' + branch + ' from ' + base);
  if (!dry) mustGit(['worktree', 'add', '-b', branch, path, base], main);

  const skipped = [];
  for (const e of link) {
    const src = resolve(main, e);
    if (!present(src)) { skipped.push('link ' + e + ' (missing in main checkout)'); continue; }
    console.log((dry ? '[dry-run] ' : '') + 'link   ' + e + ' -> ' + src);
    if (dry) continue;
    const dest = resolve(path, e);
    if (present(dest)) { skipped.push('link ' + e + ' (already exists in worktree, tracked?)'); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    const type = process.platform === 'win32' ? 'junction' : (lstatSync(src).isDirectory() ? 'dir' : 'file');
    try { symlinkSync(src, dest, type); }
    catch (err) { fail('cannot create link for ' + e + ' (' + err.code + '). On Windows enable Developer Mode or use junctions; otherwise do a normal install. Worktree left at ' + path); }
  }
  for (const e of copy) {
    const src = resolve(main, e);
    if (!present(src)) { skipped.push('copy ' + e + ' (missing in main checkout)'); continue; }
    console.log((dry ? '[dry-run] ' : '') + 'copy   ' + e);
    if (dry) continue;
    const dest = resolve(path, e);
    if (present(dest)) { skipped.push('copy ' + e + ' (already exists in worktree)'); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
  const added = addExclude([...link, ...copy].map(e => '/' + e));
  if (added.length) console.log((dry ? '[dry-run] ' : '') + 'exclude ' + added.join(' ') + ' (git info/exclude, so links and copies never show as untracked)');
  if (opts['save-config'] === true && !cfg.exists) {
    console.log((dry ? '[dry-run] ' : '') + 'save   ' + configPath + ' (local only, excluded from git)');
    if (!dry) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ link, copy, postCreate: [] }, null, 2) + '\n');
    }
    addExclude(['/.ai/worktree.json']);
  }
  for (const c of post) {
    console.log((dry ? '[dry-run] ' : '') + 'postCreate: ' + c);
    if (dry) continue;
    const r = spawnSync(c, { cwd: path, shell: true, stdio: 'inherit' });
    if (r.status !== 0) fail('postCreate failed (exit ' + r.status + '): ' + c);
  }
  skipped.forEach(s => console.log('skipped ' + s));
  console.log(JSON.stringify({ path, branch, base, link, copy, skipped }));
}

function check() {
  const path = wtPath();
  const problems = [];
  if (!existsSync(path)) fail('path does not exist: ' + path);
  const top = git(['rev-parse', '--show-toplevel'], path);
  if (!top.ok || realpathSync(top.out) !== realpathSync(path)) problems.push('path is not the root of a git worktree: ' + path);
  else {
    if (realpathSync(path) === realpathSync(main)) problems.push('path is the main checkout, not a linked worktree');
    const branch = mustGit(['rev-parse', '--abbrev-ref', 'HEAD'], path);
    if (typeof opts.branch === 'string' && branch !== opts.branch) problems.push('branch is ' + branch + ', expected ' + opts.branch);
    const cfg = loadConfig();
    const link = list(opts.link) || cfg.link;
    for (const e of link.map(safeEntry)) {
      const dest = resolve(path, e);
      const src = resolve(main, e);
      if (isLink(dest)) {
        if (!existsSync(dest)) problems.push('broken link: ' + e + ' -> ' + readlinkSync(dest));
      } else if (!present(dest) && present(src)) problems.push('missing: ' + e + ' (exists in main checkout but not linked)');
    }
    const dirty = mustGit(['status', '--porcelain'], path);
    console.log('branch: ' + branch + ' | status: ' + (dirty ? dirty.split('\n').length + ' changed/untracked path(s)' : 'clean'));
  }
  if (problems.length) { problems.forEach(p => console.error('FAIL ' + p)); process.exit(1); }
  console.log('PASS ' + path);
}

function unlink() {
  const path = wtPath();
  const cfg = loadConfig();
  const entries = (list(opts.only) || cfg.link).map(safeEntry);
  if (!entries.length) fail('nothing to unlink (no link entries in config; pass --only a,b)');
  for (const e of entries) {
    const dest = resolve(path, e);
    if (!isLink(dest)) { console.log('skip ' + e + ' (not a symlink)'); continue; }
    const target = realpathSync(dest);
    console.log('unlink ' + e + (opts.empty === true ? ' (empty dir, install fresh)' : ' (real copy of ' + target + ')'));
    unlinkSync(dest);
    if (opts.empty === true) mkdirSync(dest, { recursive: true });
    else cpSync(target, dest, { recursive: true });
  }
}

function remove() {
  const path = wtPath();
  if (!existsSync(path)) fail('path does not exist: ' + path);
  if (realpathSync(path) === realpathSync(main)) fail('refusing to remove the main checkout');
  const dirty = mustGit(['status', '--porcelain'], path);
  if (dirty && opts.force !== true) fail('worktree has uncommitted or untracked changes:\n' + dirty + '\nDecide their fate first, or pass --force to discard them.');
  for (const e of loadConfig().link.map(safeEntry)) {
    const dest = resolve(path, e);
    if (isLink(dest)) unlinkSync(dest);   // removes the link only, never the target
  }
  mustGit(['worktree', 'remove', ...(opts.force === true ? ['--force'] : []), path], main);
  console.log('removed ' + path + '. The branch was kept; delete or merge it deliberately.');
}

const commands = { detect: () => console.log(JSON.stringify(detect(), null, 2)), create, check, unlink, remove };
if (!commands[cmd]) fail('usage: worktree.mjs <detect|create|check|unlink|remove> [options] (see header of this file)');
commands[cmd]();

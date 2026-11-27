#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const load = path => JSON.parse(read(path));
const codex = load('.codex-plugin/plugin.json');
const anti = load('.antigravity-plugin/plugin.json');
const claude = load('.claude-plugin/plugin.json');
const hooks = load('hooks/hooks.json');
const manifest = load('integrations/manifest.json');
assert.equal(codex.name, 'qark');
assert.equal(codex.skills, './skills/');
assert.equal(anti.name, 'qark');
assert.equal(claude.name, 'qark');
assert.ok(existsSync(resolve(root, 'skills/qark/SKILL.md')));
assert.ok(existsSync(resolve(root, 'SKILL.md')));
assert.ok(existsSync(resolve(root, 'agents/orchestrator.md')));
assert.ok(existsSync(resolve(root, 'rules/AGENTS.md')));

for (const role of ['orchestrator', 'researcher', 'coder', 'code-reviewer', 'qa']) {
  const content = read(`agents/${role}.md`);
  assert.match(content, /^---\nname: /);
  assert.match(content, /\nsubagent: (true|false)\n/);
}
assert.ok(!existsSync(resolve(root, 'agents/test-writer.md')), 'Test Writer was merged into Coder');
assert.match(read('agents/coder.md'), /test-only/i);
const qa = read('agents/qa.md');
assert.match(qa, /Before\/after video \(UI\)/);
assert.match(qa, /CLI test-run video/);
assert.match(qa, /BASELINE_N\/A/);
assert.match(qa, /git worktree/);
assert.match(qa, /setup\.mjs --only qa-video --check/);
assert.match(qa, /supporting evidence, not the verdict/);
assert.ok(!existsSync(resolve(root, 'integrations/qa-video/setup.mjs')), 'qa-video setup lives in integrations/setup.mjs');
assert.ok(manifest.integrations.some(x => x.id === 'qa-video'));
for (const tool of ['lib', 'record-ui', 'record-cli', 'side-by-side']) {
  const toolPath = resolve(root, `integrations/qa-video/${tool}.mjs`);
  assert.ok(existsSync(toolPath), `missing qa-video/${tool}.mjs`);
  const check = spawnSync(process.execPath, ['--check', toolPath], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
}
const setupHelp = spawnSync(process.execPath, [resolve(root, 'integrations/setup.mjs'), '--help'], { encoding: 'utf8' });
assert.equal(setupHelp.status, 0, setupHelp.stderr);
assert.match(setupHelp.stdout, /--check/);
assert.match(setupHelp.stdout, /qa-video/);

assert.ok(existsSync(resolve(root, 'docs/grill-me.md')));
assert.ok(existsSync(resolve(root, 'templates/global-bootstrap.md')));
assert.ok(existsSync(resolve(root, 'docs/auto-activation.md')));
assert.ok(existsSync(resolve(root, 'integrations/herdr.md')));

const herdr = read('integrations/herdr.md');
assert.match(herdr, /HERDR_ENV/);
assert.match(herdr, /standing/i);
assert.match(herdr, /qark-<role>-<task-id>/);
assert.match(herdr, /\.ai\/runs\//);
assert.doesNotMatch(herdr, /herdr pane split|herdr agent start/, 'Herdr command syntax belongs to the official skill');
assert.match(read('SKILL.md'), /Herdr \(automatic\)/);

const grillMe = read('docs/grill-me.md');
assert.match(grillMe, /ONE question at a time/);
assert.match(grillMe, /Readiness confidence/);
assert.match(grillMe, /recommended default and 2–4 concrete answer options/);
assert.match(grillMe, /round\(/);
assert.match(read('SKILL.md'), /Code Reviewer/);
assert.match(read('SKILL.md'), /Grill Me/);

for (const file of ['README.md', 'SKILL.md', 'agents/orchestrator.md', 'docs/agent-handoff-and-execution.md',
  'integrations/README.md', 'tests/native-adapters-smoke.mjs']) {
  assert.doesNotMatch(read(file), /[^\\]\\n\\n|\\n$/m, `${file} contains literal \\n escape sequences`);
}
for (const file of ['README.md', 'SKILL.md', 'agents/orchestrator.md', 'agents/code-reviewer.md', 'agents/qa.md',
  'docs/agent-handoff-and-execution.md', 'templates/technical-implementation-plan.md']) {
  assert.doesNotMatch(read(file), /Test Writer|test-writer/, `${file} still references the removed Test Writer role`);
}

assert.ok(manifest.integrations.some(x => x.id === 'systematic-debugging'));

// Review cycle cap (max 2 fix/re-review cycles, then escalate to the user)
for (const file of ['SKILL.md', 'agents/orchestrator.md', 'docs/agent-handoff-and-execution.md']) {
  assert.match(read(file), /2 review cycles per task|at most \*\*2 cycles per task\*\*/, `${file} must state the review cycle cap`);
}
assert.match(read('templates/technical-implementation-plan.md'), /Review cycles used:\*\* 0\/2/);
assert.match(read('agents/code-reviewer.md'), /Cycle awareness/);

// Behavioral evals: suite shape, fixture, runner dry-run, and the transcript analyzer (no model calls)
const suite = load('evals/cases.json');
const caseTypes = new Set(['explicit', 'implicit', 'noisy', 'negative']);
assert.ok(suite.cases.length >= 8);
assert.equal(new Set(suite.cases.map(c => c.id)).size, suite.cases.length, 'duplicate eval case ids');
for (const c of suite.cases) {
  assert.ok(caseTypes.has(c.type), `bad eval type ${c.type}`);
  assert.ok(c.prompt && c.expect && 'skill_read' in c.expect && 'code_edits' in c.expect, `incomplete eval case ${c.id}`);
}
for (const type of caseTypes) assert.ok(suite.cases.some(c => c.type === type), `no ${type} eval case`);
assert.ok(suite.cases.some(c => c.expect.skill_read === false), 'need negative controls');
for (const file of ['package.json', 'README.md', 'src/orders.js', 'src/auth.js', 'src/checkout.js', 'src/ui/labels.js']) {
  assert.ok(existsSync(resolve(root, 'evals/fixtures/shop-app', file)), `missing fixture ${file}`);
}
for (const file of ['evals/run.mjs', 'evals/analyze.mjs']) {
  const check = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
}
const dry = spawnSync(process.execPath, [resolve(root, 'evals/run.mjs')], { encoding: 'utf8' });
assert.equal(dry.status, 0, dry.stderr);
assert.match(dry.stdout, /Dry run: \d+ case\(s\)/);
const { analyzeStream, scoreCase, summarize } = await import(new URL('../evals/analyze.mjs', import.meta.url));
const line = event => JSON.stringify(event);
const tool = (name, input) => line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const viaSkill = analyzeStream([tool('Skill', { skill: 'qark:qark' }), tool('Edit', { file_path: '/p/src/a.js' }),
  line({ type: 'result', total_cost_usd: 0.1, num_turns: 3, is_error: false, result: 'ok' })].join('\n'));
assert.equal(viaSkill.skillRead, true);
assert.equal(viaSkill.codeEdits, true);
assert.equal(viaSkill.costUsd, 0.1);
const viaRead = analyzeStream(tool('Read', { file_path: '/home/u/.agents/skills/qark/SKILL.md' }));
assert.equal(viaRead.skillRead, true);
const planOnly = analyzeStream(tool('Write', { file_path: '/p/.ai/plans/PLAN-1.md' }));
assert.equal(planOnly.codeEdits, false, 'writes under .ai/ are plans, not code edits');
assert.equal(analyzeStream(tool('Read', { file_path: '/p/src/other.js' })).skillRead, false);
const blocked = analyzeStream(line({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true,
  content: "Claude requested permissions to read from /x/qark/SKILL.md, but you haven't granted it yet." }] } }));
assert.equal(blocked.blockedReads.length, 1);
assert.ok(scoreCase({ skill_read: null, code_edits: null }, blocked).failures[0].startsWith('HARNESS'));
assert.equal(scoreCase({ skill_read: true, code_edits: false }, viaSkill).pass, false);
assert.equal(scoreCase({ skill_read: true, code_edits: true }, viaSkill).pass, true);
assert.equal(scoreCase({ skill_read: null, code_edits: null }, viaRead).pass, true);
const metrics = summarize([
  { expect: { skill_read: true, code_edits: true }, runs: [{ observed: viaSkill }] },
  { expect: { skill_read: false, code_edits: false }, runs: [{ observed: viaRead }] }
]);
assert.equal(metrics.triggerAccuracy, 1);
assert.equal(metrics.falsePositiveRate, 1);

assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|clear|compact');
const hookPath = resolve(root, 'hooks/session-start.mjs');
const syntax = spawnSync(process.execPath, ['--check', hookPath], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr);
const out = spawnSync(process.execPath, [hookPath], { encoding: 'utf8' });
assert.equal(out.status, 0, out.stderr);
const payload = JSON.parse(out.stdout);
assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
const context = payload.hookSpecificOutput.additionalContext;
assert.match(context, /Impact-Driven Planning/);
assert.match(context, /even when the user does not say qark/);
assert.match(context, /systematic-debugging/);
assert.match(context, /HERDR_ENV=1/);
assert.doesNotMatch(context, /install.*automatically/i);
const installer = spawnSync(process.execPath, ['--check', resolve(root, 'integrations/setup.mjs')], { encoding: 'utf8' });
assert.equal(installer.status, 0, installer.stderr);
const orch = read('agents/orchestrator.md');
assert.match(orch, /Worktree setup/);
assert.match(orch, /every planned feature/);
assert.match(orch, /Fast Path never asks/);
assert.match(read('agents/coder.md'), /git rev-parse --show-toplevel/);
assert.match(read('integrations/herdr.md'), /Worktree: <absolute path>/);
assert.match(read('agents/qa.md'), /scripts\/worktree\.mjs create/);
const wt = resolve(root, 'scripts/worktree.mjs');
assert.equal(spawnSync(process.execPath, ['--check', wt], { encoding: 'utf8' }).status, 0);
console.log('PASS: manifests, role specs, Herdr driver spec, QA video tools, review cycle cap, worktree script, eval suite and analyzer, bootstrap JSON, setup syntax');

// Pure helpers for the activation evals: turn a Claude Code `--output-format stream-json` transcript into
// observations, score them against a case's expectations, and compute the aggregate metrics.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SKILL_FILE = /qark[^"\\]*SKILL\.md|SKILL\.md[^"\\]*qark/i;
const PLAN_AREA = /(^|\/)\.ai\//;
const SKIP_DIRS = new Set(['.ai', '.claude', '.git', 'node_modules']);

// The ten edge-case categories of plan section 4.1; a category counts when its term appears in the plan or answer.
export const EDGE_CASES = {
  'nil/empty input': /\b(nil|null|empty|missing)\b/i,
  duplicates: /duplicate/i,
  'out-of-order': /out[- ]of[- ]order|re-?order/i,
  retries: /retr(y|ies)/i,
  idempotency: /idempoten/i,
  'partial failure': /partial(ly)?[- ]fail/i,
  rollback: /roll[- ]?back|compensat/i,
  timeouts: /time[- ]?out/i,
  concurrency: /concurren|race condition|parallel/i,
  rounding: /rounding|precision|currenc/i
};

export function edgeCasesFound(text) {
  return Object.keys(EDGE_CASES).filter(name => EDGE_CASES[name].test(text));
}

function listFiles(dir, base = dir, out = new Map()) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, base, out);
    else out.set(full.slice(base.length + 1), readFileSync(full, 'utf8'));
  }
  return out;
}

// Plain filesystem diff of a fixture vs the agent's working copy: files changed/added and lines added.
export function diffTrees(beforeDir, afterDir) {
  const before = listFiles(beforeDir);
  const after = listFiles(afterDir);
  const changed = [], added = [];
  let linesAdded = 0;
  for (const [path, content] of after) {
    if (!before.has(path)) { added.push(path); linesAdded += content.split('\n').length; continue; }
    if (before.get(path) === content) continue;
    changed.push(path);
    const old = new Map();
    for (const l of before.get(path).split('\n')) old.set(l, (old.get(l) ?? 0) + 1);
    for (const l of content.split('\n')) {
      if (old.get(l) > 0) old.set(l, old.get(l) - 1); else linesAdded++;
    }
  }
  const removed = [...before.keys()].filter(path => !after.has(path));
  return { changed, added, removed, filesChanged: changed.length + added.length + removed.length, newFiles: added.length, linesAdded };
}

export function analyzeStream(text) {
  const toolCalls = [];
  const proseParts = [];
  let lastText = '';
  let result = null;
  const blockedReads = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'assistant') {
      for (const part of event.message?.content ?? []) {
        if (part.type === 'tool_use') toolCalls.push({ name: part.name, input: part.input ?? {} });
        else if (part.type === 'text') { lastText = part.text; proseParts.push(part.text); }
      }
    } else if (event.type === 'user') {
      for (const part of Array.isArray(event.message?.content) ? event.message.content : []) {
        const blocked = part.type === 'tool_result' && part.is_error && String(part.content).match(/requested permissions? to read from (\S+?),/);
        if (blocked && /qark/i.test(blocked[1])) blockedReads.push(blocked[1]);
      }
    } else if (event.type === 'result') result = event;
  }

  const skillCall = toolCalls.find(call => {
    const input = JSON.stringify(call.input);
    return call.name === 'Skill' ? /qark/i.test(input) : SKILL_FILE.test(input);
  });
  const editedFiles = toolCalls
    .filter(call => EDIT_TOOLS.has(call.name))
    .map(call => String(call.input.file_path ?? call.input.notebook_path ?? ''))
    .filter(path => !PLAN_AREA.test(path));
  const tools = {};
  for (const call of toolCalls) tools[call.name] = (tools[call.name] ?? 0) + 1;
  const planWrites = toolCalls
    .filter(call => EDIT_TOOLS.has(call.name) && PLAN_AREA.test(String(call.input.file_path ?? '')))
    .map(call => String(call.input.content ?? call.input.new_string ?? ''));
  const edgeCasesCovered = edgeCasesFound([...planWrites, ...proseParts, String(result?.result ?? '')].join('\n'));

  return {
    edgeCasesCovered,
    skillRead: Boolean(skillCall),
    skillEvidence: skillCall ? skillCall.name + ' ' + JSON.stringify(skillCall.input).slice(0, 160) : null,
    codeEdits: editedFiles.length > 0,
    editedFiles,
    blockedReads,
    tools,
    costUsd: result?.total_cost_usd ?? null,
    turns: result?.num_turns ?? null,
    completed: result ? !result.is_error : false,
    answer: String(result?.result ?? lastText).slice(0, 240)
  };
}

export function scoreCase(expect, observed) {
  const failures = [];
  if (observed.blockedReads?.length) {
    failures.push('HARNESS: qark files unreadable (permission denied): ' + [...new Set(observed.blockedReads)].join(', '));
  }
  if (expect.skill_read !== null && expect.skill_read !== undefined && expect.skill_read !== observed.skillRead) {
    failures.push('skill_read expected ' + expect.skill_read + ' but was ' + observed.skillRead);
  }
  if (expect.code_edits !== null && expect.code_edits !== undefined && expect.code_edits !== observed.codeEdits) {
    failures.push('code_edits expected ' + expect.code_edits + ' but was ' + observed.codeEdits +
      (observed.editedFiles.length ? ' (' + observed.editedFiles.join(', ') + ')' : ''));
  }
  if (expect.diff_budget) {
    const budget = expect.diff_budget, diff = observed.diff;
    if (!diff) failures.push('diff_budget set but diff was not measured');
    else {
      if (budget.max_files_changed != null && diff.filesChanged > budget.max_files_changed) {
        failures.push('diff touched ' + diff.filesChanged + ' files, budget ' + budget.max_files_changed + ' (' + [...diff.changed, ...diff.added, ...diff.removed].join(', ') + ')');
      }
      if (budget.max_new_files != null && diff.newFiles > budget.max_new_files) {
        failures.push('diff added ' + diff.newFiles + ' new files, budget ' + budget.max_new_files + ' (' + diff.added.join(', ') + ')');
      }
      if (budget.max_lines_added != null && diff.linesAdded > budget.max_lines_added) {
        failures.push('diff added ' + diff.linesAdded + ' lines, budget ' + budget.max_lines_added);
      }
      for (const file of budget.untouched ?? []) {
        if ([...diff.changed, ...diff.removed].includes(file)) failures.push(file + ' must stay untouched');
      }
    }
  }
  if (expect.edge_cases) {
    const missing = Object.keys(EDGE_CASES).filter(name => !(observed.edgeCasesCovered ?? []).includes(name));
    if (missing.length) failures.push('edge-case list missing: ' + missing.join(', '));
  }
  return { pass: failures.length === 0, failures };
}

// rows: [{ type, expect, runs: [{ pass, observed }] }]
export function summarize(rows) {
  const rate = (hits, total) => (total ? hits / total : null);
  let triggerHits = 0, triggerTotal = 0, falsePositives = 0, negativeTotal = 0, editHits = 0, editTotal = 0;
  let budgetHits = 0, budgetTotal = 0, edgeHits = 0, edgeTotal = 0;
  for (const row of rows) {
    for (const run of row.runs) {
      if (row.expect.diff_budget) { budgetTotal++; if (scoreCase({ diff_budget: row.expect.diff_budget }, run.observed).pass) budgetHits++; }
      if (row.expect.edge_cases) { edgeTotal++; if (scoreCase({ edge_cases: true }, run.observed).pass) edgeHits++; }
      if (row.expect.skill_read === true) { triggerTotal++; if (run.observed.skillRead) triggerHits++; }
      if (row.expect.skill_read === false) { negativeTotal++; if (run.observed.skillRead) falsePositives++; }
      if (row.expect.code_edits === true || row.expect.code_edits === false) {
        editTotal++;
        if (row.expect.code_edits === run.observed.codeEdits) editHits++;
      }
    }
  }
  return {
    triggerAccuracy: rate(triggerHits, triggerTotal), triggerHits, triggerTotal,
    falsePositiveRate: rate(falsePositives, negativeTotal), falsePositives, negativeTotal,
    editBehaviorAccuracy: rate(editHits, editTotal), editHits, editTotal,
    diffBudgetAccuracy: rate(budgetHits, budgetTotal), budgetHits, budgetTotal,
    edgeCaseAccuracy: rate(edgeHits, edgeTotal), edgeHits, edgeTotal
  };
}

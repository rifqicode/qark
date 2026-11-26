// Pure helpers for the activation evals: turn a Claude Code `--output-format stream-json` transcript into
// observations, score them against a case's expectations, and compute the aggregate metrics.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SKILL_FILE = /qark[^"\\]*SKILL\.md|SKILL\.md[^"\\]*qark/i;
const PLAN_AREA = /(^|\/)\.ai\//;

export function analyzeStream(text) {
  const toolCalls = [];
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
        else if (part.type === 'text') lastText = part.text;
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

  return {
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
  return { pass: failures.length === 0, failures };
}

// rows: [{ type, expect, runs: [{ pass, observed }] }]
export function summarize(rows) {
  const rate = (hits, total) => (total ? hits / total : null);
  let triggerHits = 0, triggerTotal = 0, falsePositives = 0, negativeTotal = 0, editHits = 0, editTotal = 0;
  for (const row of rows) {
    for (const run of row.runs) {
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
    editBehaviorAccuracy: rate(editHits, editTotal), editHits, editTotal
  };
}

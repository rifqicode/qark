# Qark behavioral evals

The smoke test only checks that files exist. These evals check **behavior**: does Qark activate when it should, stay quiet when it should, and route correctly (Fast Path edits, Impact Gate stops before editing)?

Each case in [cases.json](cases.json) runs one prompt headlessly in a throwaway copy of [fixtures/shop-app](fixtures/shop-app) with this checkout loaded as a plugin. The runner then inspects the tool calls in the transcript.

```bash
node evals/run.mjs                                   # list cases, no model calls
node evals/run.mjs --run                             # run everything (12 model calls, roughly $2-3, ~15 min)
node evals/run.mjs --run --case fast-label,neg-capital --repeat 3
node evals/run.mjs --run --type negative
```

`--run` is required because every case is a real model call. Currently only `--host claude` is implemented.

## What is measured

| Metric | Meaning |
| --- | --- |
| **Trigger accuracy** | Cases that should use Qark: share where the agent invoked the `qark` skill or read its `SKILL.md` |
| **False-positive rate** | Negative controls (`skill_read: false`): share where Qark was used anyway |
| **Edit behavior** | `code_edits` expectations: Fast Path cases must edit, Impact Gate and investigation cases must **not** edit code before approval. Writes under `.ai/` (plans) do not count as code edits |

Case types follow common skill-eval practice: `explicit` (names Qark), `implicit` (describes the need), `noisy` (messy real-world phrasing), `negative` (must stay out, or must not edit). An expectation of `null` means "not checked".

## Reading results

Per run, a JSON summary and the raw transcripts are written to `evals/results/` (git-ignored). Open a transcript when a case fails: the tool calls show what the agent actually did.

## Caveats

- **Nondeterministic.** One run per case is a signal, not proof. Use `--repeat 3` before drawing conclusions from a single failure.
- **Harness integrity.** If the agent cannot read Qark's own files (permission denied), the run is marked `HARNESS` and fails rather than silently testing a degraded workflow. The runner grants read access to this checkout with `--add-dir`.
- **No Herdr side effects.** `HERDR_*` variables are removed from the child environment so an eval can never spawn panes or touch your Herdr session.
- **Evals run in a temp directory** with `--permission-mode acceptEdits`, so file edits there are auto-approved; Bash is not.
- **Skill detection** counts a `Skill` call naming `qark` or any tool call touching a `qark/.../SKILL.md` path. Context injected by the SessionStart hook alone is not counted as "read".

# Herdr — delegation driver for Qark Orchestrator

When Qark runs **inside Herdr**, specialist delegation uses Herdr as its driver: each specialist is started as a separate CLI agent in its own visible pane, instead of an invisible in-process subagent.

Division of responsibility:

- The official **Herdr skill** is the sole authority on Herdr commands, flags, IDs and lifecycle states. Source: https://github.com/herdrdev/herdr/tree/master/skills/herdr. Qark never copies, guesses or hardcodes Herdr command syntax; read the skill and `herdr --help` for the installed version.
- **Qark** owns the protocol: which role runs where, what it is told, where its result goes, who may write which files, and what counts as verified.

## Standing opt-in

The official Herdr skill is written to trigger only when the user explicitly asks for Herdr. Installing Qark and running it inside Herdr is the user's **standing explicit request** to use Herdr for delegation. This does not extend to anything outside delegation (no closing panes Qark did not create, no touching other workspaces, no stopping the server).

## Activation (automatic)

Use the Herdr driver when **all** are true:

1. `test "${HERDR_ENV:-}" = 1` succeeds in the current shell. If not, Herdr is not the driver; do not control any Herdr session from outside.
2. The `herdr` skill is installed and readable in the current host, and you have actually read it this session. A binary in `PATH` without the skill read does not count.
3. The work is **planned delegation** (an approved plan with task IDs, or a substantial Researcher/Coder/Code Reviewer/QA assignment). Fast Path and trivial work stay in the current agent; do not spawn panes for them.

Otherwise fall through, in order: host-native subagents, then sequential role-scoped execution. State which driver was used in the report. Never claim a pane was launched without observing it in the Herdr response.

## Spawn protocol

For each delegated task (operations only; take exact syntax from the Herdr skill):

1. **Pane:** split a sibling pane from the current one, preserving the working directory and the user's focus (no-focus). Choose direction per the Herdr skill's layout guidance. Read the new pane ID from the response; never predict IDs.
2. **Agent:** start a CLI agent in that pane with a unique name `qark-<role>-<task-id>` (lowercase, e.g. `qark-coder-imp01`, `qark-reviewer-review01`). Default to the same agent kind as the Orchestrator's host unless the user requests another. Wait until Herdr reports it ready.
3. **Handoff:** send one self-contained prompt (template below) and wait for the settled state with a bounded timeout.
4. **Collect:** read the result file the agent was told to write; use pane/agent output only as a fallback. If the state is `blocked`, inspect the pane, report the dialog to the user and **do not answer approvals yourself**. A timeout or stall does not prove the prompt was not delivered; inspect before re-sending.
5. **Verify:** `idle`/`done` is a lifecycle signal, not proof. The Orchestrator checks the actual diff, evidence and, for code, re-runs or reviews the reported checks before recording `DONE`/`PASS`.
6. **Cleanup:** close only panes Qark created, and only after the result is captured and recorded. Leave blocked or failed panes open for the user to inspect.

## Handoff prompt template

A spawned agent is a fresh process with **no conversation context**. Everything it needs must be in the prompt or in files it can read:

```text
You are the Qark <ROLE> for task <TASK-ID>.
1. Read the role spec: <absolute path to installed agents/<role>.md>
2. Plan: <project>/.ai/plans/<plan-id>.md, version <N>. Your tasks: <IDs>. Criteria: <AC IDs>.
   (Fast Path / no plan: scope = <one concise paragraph>.)
3. Write scope (you may edit only these): <paths/globs>. Forbidden: <paths>.
   Do not edit the plan file, commit, push, deploy or touch production.
4. Mode: <standard | test-only>.
5. Run these checks when feasible: <commands from the project, if known>.
6. When finished, write your result in the role's Result format to
   <project>/.ai/runs/<plan-id or fastpath>/<TASK-ID>.md, then reply with only that path and
   one line of status. Report BLOCKED instead of guessing.
```

The role spec's own result format and evidence rules still apply. The Orchestrator remains the single writer of the plan; agents never edit it.

## Isolation and parallelism

- Separate panes are **not** filesystem isolation. All panes share one working tree unless a worktree is used.
- Read-only roles (Researcher, Code Reviewer, QA) may run in parallel panes against the same tree.
- Parallel **writers** require disjoint file ownership declared in the handoff, or separate worktrees (see the Herdr skill's worktree commands). Otherwise run writers sequentially. Shared config, schemas, lockfiles and snapshots are coordinated by the Orchestrator.
- After parallel work, the Orchestrator integrates, runs combined checks, and only then proceeds to Code Review and QA.

## Run artifacts

Per-task result files (and QA videos, logs and JSON under `.ai/runs/<plan-id>/qa/`) live in the target project under `.ai/runs/` and are working notes, not the canonical plan. They should normally be git-ignored; ask before committing them. Do not store secrets or full terminal dumps there.

## Boundaries

- Qark remains authoritative over role/task assignment, approved plans, ownership, review gates, QA evidence and final status. Herdr only provides process and pane control.
- Do not close, move or type into panes, tabs or workspaces Qark did not create. Never stop the Herdr server or kill its main process.
- Prefer no-focus for background work; do not steal the user's focus unless asked.
- Native internal subagents are not visible in Herdr panes. If the host launches subagents natively, say so rather than implying pane-level tracking.

---
name: qark
description: Auto-route software development tasks to Qark when available: implement features, fix bugs, refactor, research code, plan architecture, write tests, review code and perform QA. Fast Path for simple low-risk work; Grill Me and approved planning for material changes.
---

# Qark — Native Plugin Skill

Read the canonical [root workflow](../../SKILL.md) and [Orchestrator role](../../agents/orchestrator.md) before acting on software-development requests. They define the authoritative routing, permissions, and evidence requirements. Load only specialists that apply to the current task.

## Lightweight router

- **Intent:** An explanation or planning request grants no implementation permission.
- **Fast Path:** Only for explicitly requested wording, typo, docs/comment or presentation-only UI changes that touch no Impact Gate trigger; implement directly and verify proportionately. If it reveals a trigger, stop and re-route.
- **Impact Gate:** If the change touches money, ledger/balances, schema/migrations, vendor integrations, message consumers/producers, auth, API/event contracts or state, or adds a dependency/abstraction (full list in root `SKILL.md` step 5), or you are unsure, prepare an approved Technical Plan before implementing it.
- **Debugging:** For bugs, regressions, failed tests/builds and unexpected behavior, check whether `systematic-debugging` is installed. Read and use it if available, otherwise follow the Researcher evidence-first process. Do not auto-install it.
- **Delegation:** For planned work, inside Herdr (`HERDR_ENV=1` and the `herdr` skill readable) spawn specialists as visible separate CLI agents via Herdr automatically; otherwise use native subagents only if the host actually launches them; otherwise run stages sequentially. Never claim a launch you did not observe.
- **Evidence:** Never mark QA or tests as passed without observed execution.

This plugin skill is a native discovery entrypoint; the root `SKILL.md` remains the single canonical specification.

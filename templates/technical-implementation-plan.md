# Technical Implementation Plan — [Feature Name]

> Template v1.0 · Status: DRAFT · Plan ID: PLAN-YYYYMMDD-001 · Version: 0.1 · Owner: Orchestrator

**Location:** the **target project's** `.ai/plans/<plan-id>.md`, never this skills repository. See [Plan Storage](../docs/plan-storage.md).

**Adaptive:** Trim sections for small scope, but never remove §4.1 (edge cases). Do not invent file paths, tests, or verification results.

## 1. Overview

**Problem:** [What is happening / missing?]

**Target outcome:** [Observable expected behavior]

**Scope:** [In scope]

**Non-goals:** [What a reasonable engineer might add but we will not: generic framework, flag, retry library, extra endpoint. — Why: the Coder and Reviewer check the diff against this list.]

**Constraints:** [Security, backward compatibility, cost, deadline]

## 2. Existing system & research

> Researcher provides file/symbol references for inspected facts. If not verified, explicitly state assumptions.

| Area | Verified finding / source | Impact |
| --- | --- | --- |
| [Module / flow] | [Path, symbol, branch/ref] | [Constraint or reuse] |

**Grill Me checkpoints:** [Intake and post-research readiness confidence NN% (heuristic), five dimension scores, question-by-question decisions, blockers/resolutions, or why skipped. Confidence is requirement coverage, not a probability or approval.]

## 3. Technical design & decisions

**Proposed approach:** [Solution and rationale]

**Data / control flow:** [Describe or include Mermaid diagram if useful]

**Contracts affected:** [API, schema, states, event formats or N/A]

**Simplest option considered:** [The smallest change that could meet the acceptance criteria. If not chosen, name the criterion it fails. Any new abstraction, dependency or file must be listed here. — Why: complexity must justify itself against the minimum.]

| Decision | Status | Rationale |
| --- | --- | --- |
| [Design choice] | PROPOSED / APPROVED | [Why] |

## 4. Acceptance criteria

| ID | Behavior | Priority |
| --- | --- | --- |
| AC-01 | Given [precondition], when [action], then [observable outcome] | MUST |
| AC-02 | Given [failure/boundary], when [action], then [safe outcome] | MUST |

### 4.1 Edge cases & failure modes

> Every row is answered: `Y` with expected behavior and a test, or `N/A` with a reason. A blank row is a plan defect. — Why: a skipped case becomes visible instead of silent. Detail: [backend-qa](../docs/backend-qa.md).

| ID | Case | Applies | Expected behavior | Test |
| --- | --- | --- | --- | --- |
| EC-01 | nil / empty / missing input | Y / N/A: reason | [ ] | T-xx |
| EC-02 | duplicates (same request or event twice) | | | |
| EC-03 | out-of-order messages | | | |
| EC-04 | retries (caller, consumer, vendor) | | | |
| EC-05 | idempotency (key, dedupe, replay) | | | |
| EC-06 | partial failure (step N of M fails) | | | |
| EC-07 | rollback / compensation | | | |
| EC-08 | timeouts (slow or no response) | | | |
| EC-09 | concurrency (parallel writers, locking) | | | |
| EC-10 | rounding / precision / currency | | | |

## 5. Execution & progress

> The Orchestrator alone consolidates agent status changes here. The plan is the **task contract**; do not create redundant copies for specialists.

| Task ID | Owner | Deliverable | Dependencies | Criteria | Work status | Verification | Evidence / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RES-01 | Researcher | Verify existing architecture | — | — | TODO | NOT_RUN | — |
| IMP-01 | Coder | Implement scoped change with its automated tests | RES-01 | AC-01, AC-02 | TODO | NOT_RUN | — |
| IMP-02 | Coder (test-only) | Independent tests from criteria; high-risk areas only, otherwise delete this row | Stable contract | AC-01, AC-02 | TODO | NOT_RUN | — |
| REVIEW-01 | Code Reviewer | Review combined implementation and test diff | IMP-01 | AC-01, AC-02 | TODO | NOT_RUN | — |
| QA-01 | QA | Real-app validation | REVIEW-01 | AC-01, AC-02 | TODO | NOT_RUN | — |

**Work statuses:** TODO / IN_PROGRESS / BLOCKED / DONE / SKIPPED

**Verification statuses:** NOT_RUN / PASS / FAIL / BLOCKED

`DONE` is **not** equivalent to `PASS`. Report actually executed commands, outputs, and observed QA results.

**Worktree:** [path, branch, base ref, link/copy lists as confirmed by the user, `check` result; or "none (user declined)". Created with `scripts/worktree.mjs`.]

## 6. Test strategy — Coder

| Test ID | Acceptance criterion | Scenario and expected result | Layer | Status |
| --- | --- | --- | --- | --- |
| T-01 | AC-01 | Happy path [expected result] | Unit / Integration | TODO |
| T-02 | AC-02 | Relevant edge/failure path [expected result] | Unit / Integration / E2E | TODO |

**Coverage gaps:** [If any]

## 7. Code review — Pre-QA Gate

**Reviewed ref / diff:** [commit or branch]

**Gate:** NOT_RUN / PASS / FAIL / BLOCKED; unresolved CRITICAL/HIGH findings block QA.

**Review cycles used:** 0/2 (one cycle = FAIL, fix, re-review; if still FAIL after the second re-review, stop and escalate to the user).

| Finding | Severity | Path / symbol evidence | Required fix / disposition | Status |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## 8. Runtime QA — QA Agent

**Environment / tested ref:** [URL, build hash, branch or CLI target]

**Tools actually available:** [Browser, Playwright, API, CLI etc.]

| QA ID | Criterion | Action & expected behavior | Result | Evidence |
| --- | --- | --- | --- | --- |
| Q-01 | AC-01 | [End-to-end scenario] | NOT_RUN | — |
| Q-02 | AC-02 | [Failure/negative scenario] | NOT_RUN | — |

**Evidence by change type** (UI video, CLI-product video, backend integration/replay text evidence) is defined in [QA](../agents/qa.md#evidence-by-change-type) and [backend-qa](../docs/backend-qa.md). Video never replaces assertions or exit codes.

If runtime/tool access is missing, record BLOCKED/NOT_RUN. Do not claim PASS from static review.

## 9. Risks, blockers & open questions

| ID | Scenario | Impact | Mitigation / verification | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| R-01 | [Risk] | [Consequence] | [Mitigation and test] | [Agent] | OPEN |

## 10. Integration & delivery gate

- [ ] Agent work integrated without unresolved edit conflicts
- [ ] Required lint/typecheck/build/tests executed and results captured
- [ ] Pre-QA code review completed on the integrated ref, or proportionate Fast Path review documented
- [ ] No unresolved CRITICAL/HIGH code review findings
- [ ] QA performed on the combined testable state, or gaps are explicitly BLOCKED/NOT_RUN
- [ ] High-impact defects addressed or explicitly accepted by user
- [ ] Scope changes and significant design deviations approved
- [ ] Final summary includes changed modules, evidence, open risks and decisions

**Final disposition:** NOT_READY / READY_FOR_REVIEW / APPROVED_BY_USER

**Release/deployment authorization:** Separate explicit permission when applicable.

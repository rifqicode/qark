# Optional external integrations

This installer is separate from `npx skills add rifqicode/qark -g`. Installing the core skill **does not execute** any external setup.

## Usage

Requires Node.js 18+ for the setup script.

```bash
node ~/.agents/skills/qark/integrations/setup.mjs --dry-run
node ~/.agents/skills/qark/integrations/setup.mjs --only caveman --yes
node ~/.agents/skills/qark/integrations/setup.mjs --only systematic-debugging
node ~/.agents/skills/qark/integrations/setup.mjs --only rtk --agent codex
node ~/.agents/skills/qark/integrations/setup.mjs --only rtk --agent all --yes
node ~/.agents/skills/qark/integrations/setup.mjs --skip caveman
```

Relative skill paths can vary across hosts; point Node at the actual installed `integrations/setup.mjs`. Or run `/qark-int-setup` (`/qark:qark-int-setup` as a plugin): a manual-only skill where the agent reads this folder, previews each install and asks before running it.

- **Caveman:** installs **only the skill** via `npx skills add JuliusBrussee/caveman -g -y`, not its proxy or model routing. To remove: `npx skills remove JuliusBrussee/caveman -g`. Source: https://github.com/JuliusBrussee/caveman
- **Systematic Debugging:** installs only the `systematic-debugging` skill from `obra/superpowers` using `npx skills add obra/superpowers --skill systematic-debugging -g -y`. Orchestrator and Researcher load it when a bug, failure or unexpected behavior needs investigation, if the host exposes the installed skill. If unavailable, they use built-in research instead. Does not auto-install or bypass Impact Gate. Source: https://github.com/obra/superpowers/tree/main/skills/systematic-debugging
- **RTK:** uses an already installed `rtk` if present. Otherwise installs via Homebrew (macOS or Linux with brew) or WinGet (Windows); on unsupported systems it prints the official manual instructions rather than running a remote shell script. Then `rtk init -g` (Claude), `rtk init -g --codex`, and/or `rtk init -g --agent antigravity`. Source: https://github.com/rtk-ai/rtk

## QA video recording (Playwright)

QA must record video for UI changes (before/after) and CLI test runs. Setup is the `qa-video` integration of the same `setup.mjs` as the others; the recording scripts live in `integrations/qa-video/`. Playwright is kept in an isolated runtime dir (`~/.cache/qark/qa-video`, override with `QARK_QA_HOME`); nothing is added to the target project.

```bash
node integrations/setup.mjs --only qa-video --check     # is recording ready? (changes nothing; exit 0 ready / 1 not)
node integrations/setup.mjs --only qa-video --dry-run   # preview the install
node integrations/setup.mjs --only qa-video --yes       # install Playwright + headless Chromium (explicit opt-in, no sudo)

node integrations/qa-video/record-ui.mjs  --script scenario.mjs --base-url http://localhost:3000 --out .ai/runs/PLAN/qa/Q-01-after
node integrations/qa-video/record-cli.mjs --out .ai/runs/PLAN/qa/Q-02-after -- npm test
node integrations/qa-video/side-by-side.mjs --before Q-01-before.webm --after Q-01-after.webm --out Q-01-compare.webm   # optional, needs ffmpeg
```

`record-cli.mjs` records a live rendering of the real command's output (not a real TTY); the `.log` and exit code are the authoritative evidence. The installer is never run automatically: QA asks for approval first, and reports video as BLOCKED if declined. On Linux, missing Chromium system libraries need `sudo npx playwright install-deps chromium`, which the script prints but never runs.

## Guardrails

- All integrations are optional, selected explicitly, and confirmed individually unless `--yes` is supplied. If `--only` is omitted, the installer offers all manifest integrations.
- `--dry-run` **does not install or modify** files. It previews intended commands and assumptions.
- No unreviewed `curl | sh` or proxy/routing setup is performed.
- RTK init may change existing agent hooks/config. Back up those files first and inspect upstream uninstall instructions; this script does not automatically undo modifications.
- `--agent all` targets Claude, Codex and Antigravity regardless of which are installed; prefer `--agent codex`, etc. when only one is needed.
- For raw unfiltered output when investigating failures, use `rtk bypass <command...>` or your original CLI directly when appropriate.
- Caveman and Systematic Debugging must not override qark's acceptance criteria, scope/approval gates, critical decisions, or QA evidence. Skill presence does not guarantee auto-loading across all agent runtimes. This package does not automatically apply its speaking style.

## Verification

```bash
node --check integrations/setup.mjs
node integrations/setup.mjs --only caveman,rtk,systematic-debugging --agent codex --dry-run
rtk gain
```

This installer provides orchestration, not a vendor-specific uninstall/rollback manager. Confirm upstream versions and review third-party code before opting in.

## Herdr delegation driver

Qark does not install Herdr or the Herdr skill. When Qark runs inside Herdr (`HERDR_ENV=1`) and the official `herdr` skill is readable, Orchestrator automatically spawns planned specialist work as visible separate CLI agents in new panes, following that skill for commands. Otherwise it falls back to native subagents or sequential execution. See [Herdr driver](herdr.md).

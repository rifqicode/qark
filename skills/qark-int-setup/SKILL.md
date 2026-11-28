---
name: qark-int-setup
description: Install Qark's optional integrations (caveman, rtk, systematic-debugging, qa-video). Only when the user explicitly runs /qark-int-setup or asks to set up Qark integrations.
disable-model-invocation: true
---

# Qark integration setup

Install the optional integrations the user picks. Nothing here runs unless the user invoked this skill. Without `qa-video`, QA cannot produce UI or CLI-product video evidence and reports it BLOCKED.

1. **Find the Qark install** (e.g. `~/.agents/skills/qark`, the plugin directory, or the checkout the user names) and use its `integrations/setup.mjs`. Do not rely on relative paths. — Why: the installer may copy only this folder, so `../../integrations` can be missing.
2. **Read `integrations/manifest.json` and `integrations/README.md` there.** They are the only source for ids, commands and caveats; do not copy command lists from memory. — Why: new integrations then need no change to this skill.
3. **Report what is already set up.** Run `node <qark>/integrations/setup.mjs --only qa-video --check` and look for the other skills and tools (`npx skills ls -g`, `rtk --version`). Change nothing yet.
4. **Ask which integrations to install**, with a one-line purpose and the caveat from the README for each. Recommend `qa-video` if the user wants QA video evidence and `systematic-debugging` for bug work.
5. **Preview, then confirm each one.** Run `--only <id> --dry-run`, show the commands, and add `--yes` only after the user agrees to that integration. — Why: these install software on the user's machine.
6. **Never use sudo or `curl | sh`.** If Chromium needs system libraries, or the host is unsupported, show the manual step from the README and let the user run it. — Why: a silent privileged or remote-script install cannot be undone by Qark.
7. **Before `rtk init`, tell the user to back up their agent config**, since it changes hooks. Pass `--agent` for the host actually in use, not `all`.
8. **Verify and report only what you saw:** re-run the check or list command and state per integration `installed`, `failed` or `skipped`, with the error. Never say it worked without that output.

# Agent instructions

Global instructions, skills and hooks for Claude Code (and, as plain text, for Codex or any agent
that reads an `AGENTS.md`). They aim at one outcome: you stay the owner of the code the agent
writes. You can explain it, trace it, predict change impact, and change it safely.

| Path | What it is |
|---|---|
| `ENGINEERING.md` | The core instructions: scope, investigation, high-risk code, impact sweep, verification, reporting, response layout |
| `skills/` | `risk-review`, `analyze-repo`, `learn`, `agents-md`, `monex-architecture`, `pre-pr-review`, `agent-handoff`, `instruction-sync` |
| `hooks/` | Claude Code hooks that enforce parts of the instructions |
| `settings.hooks.json` | The `hooks` block to merge into `~/.claude/settings.json` |
| `plugins/` | `diff-review`, a Claude Code mod, installable from this repo as a plugin marketplace |

## Install (Claude Code)

1. Clone to `~/agent-instructions`:
   ```bash
   git clone https://github.com/korawit-ch/agent-instructions.git ~/agent-instructions
   ```
2. Create a personal overlay that stays out of this repo, e.g. `~/agent-instructions-personal.md`:
   your name, how to address you, per-owner git emails, colleague nicknames, your stack, local paths
   such as the Monex template location.
3. Point `~/.claude/CLAUDE.md` at both:
   ```text
   @~/agent-instructions/ENGINEERING.md
   @~/agent-instructions-personal.md
   ```
4. Link the skills:
   ```bash
   mkdir -p ~/.claude/skills && ln -s ~/agent-instructions/skills/* ~/.claude/skills/
   ```
5. Merge `settings.hooks.json` into the `hooks` key of `~/.claude/settings.json`. The hooks need
   `jq`.

For Codex, join the files into one: `cat ENGINEERING.md ~/agent-instructions-personal.md >
~/.codex/AGENTS.md`, or let the `instruction-sync` skill do it (see below).

## Hooks

| Hook | Event | Does |
|---|---|---|
| `guard-bash.sh` | PreToolUse (Bash) | Asks before `git commit`/`push`, and before commands that reach a remote database, cloud CLI or server |
| `session-title.sh` | UserPromptSubmit, Stop | Keeps Claude desktop session titles in the `[<stories> ➔ ]<repo>[#<PRs>][,<repo>[#<PRs>]…] \| <title>` shape, and forks in `(<topic>) <parent title>`; `✅` on a "Done" prompt, `❎` on a "Close" prompt, off again on the next prompt. `⭐️` in front of everything on a "Pin" prompt, kept through renames until "Unpin". Set `SESSION_TITLE_REPOS` to your repo letters (default `W Web, A API, M Mobile`) |
| `scope-nudge.sh` | UserPromptSubmit | When a message links two or more tickets/threads, asks which one defines the job |
| `git-tag.sh` | UserPromptSubmit | Measures the session's repo and reminds Claude to add the 🌿 Git box (branch, unpushed commits, staged/unstaged/untracked files) above ⏭️ Next. Also runs by hand: `git-tag.sh <path>...` |
| `format-on-edit.sh` | PostToolUse (Edit, Write) | Runs the repo's own Prettier on the edited file |
| `review-trigger.sh` | PostToolUse (Bash) | After `gh pr create --draft`, starts the `pre-pr-review` skill. Set `PRE_PR_REVIEW_OWNERS` to limit it to some GitHub owners |

## Keeping the copies in sync

`skills/instruction-sync/sync.sh` writes the core plus your overlay to `~/.codex/AGENTS.md` and stops
if the Codex app edited that copy since the last sync. It also:

- scans this repo for personal details against your own patterns
- checks the sizes of optional hand-condensed ChatGPT copies and flags when they're stale
- regenerates a cloud setup script (see below)
- with `AGENT_INSTRUCTIONS_PUBLIC` set, flags source changes your sanitized public copy hasn't
  picked up (`public-check.sh`)

Its working files live in `~/.agent-instructions/`. Put one regex per line in
`~/.agent-instructions/leak-patterns.txt`: your name, emails, employers, colleagues, private repo
names. Paths are overridable with `AGENT_INSTRUCTIONS_DIR`, `AGENT_INSTRUCTIONS_OVERLAY` and
`AGENT_INSTRUCTIONS_STATE`.

## Plugins

`diff-review` is a Claude Code mod. It adds a note above the prompt for each repo with something to
review (commits ahead of the base branch, unpushed commits, uncommitted changes). It also adds a
pane with All / PR / Unpushed / Uncommitted tabs, the commits, and per-file diffs, and `/diff-review
[repo]` opens it. It never blocks git. Its `editor` option picks what the Open buttons use (`cursor`
or `vscode`). Install it from this repo:

```text
/plugin marketplace add korawit-ch/agent-instructions
/plugin install diff-review@agent-instructions
```

## Cloud sessions

Claude Code cloud sessions don't read your `~/.claude`. Use a personal cloud environment whose
setup script writes these files and a `~/.claude/CLAUDE.md` that imports them, or clones this repo:

```bash
git clone --depth 1 https://github.com/korawit-ch/agent-instructions.git ~/agent-instructions
mkdir -p ~/.claude
printf '@~/agent-instructions/ENGINEERING.md\n' > ~/.claude/CLAUDE.md
```

Hooks from `~/.claude/settings.json` don't run in cloud sessions. `instruction-sync` generates a
setup script (`~/.agent-instructions/cloud-setup.sh`) that writes the instruction files and the
`CLAUDE.md` in the cloud VM; it includes your overlay only while
`~/.agent-instructions/.cloud-include-personal` exists.

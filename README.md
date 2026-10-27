# Agent instructions

Global instructions, skills and hooks for Claude Code (and, as plain text, for Codex or any agent
that reads an `AGENTS.md`). They aim at one outcome: you stay the owner of the code the agent
writes. You can explain it, trace it, predict change impact, and change it safely.

| Path | What it is |
|---|---|
| `ENGINEERING.md` | The core instructions: scope, investigation, high-risk code, impact sweep, verification, reporting, response layout |
| `skills/` | `risk-review`, `analyze-repo`, `learn`, `agents-md`, `monex-architecture`, `pre-pr-review` |
| `hooks/` | Claude Code hooks that enforce parts of the instructions |
| `settings.hooks.json` | The `hooks` block to merge into `~/.claude/settings.json` |

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
~/.codex/AGENTS.md`.

## Hooks

| Hook | Event | Does |
|---|---|---|
| `guard-bash.sh` | PreToolUse (Bash) | Asks before `git commit`/`push`, and before commands that reach a remote database, cloud CLI or server |
| `session-title.sh` | UserPromptSubmit, Stop | Keeps Claude desktop session titles in the `<repos>[:<stories>][ ➔ #<PRs>] \| <title>` shape; `✅` on a "Done" prompt, off again on the next prompt. Set `SESSION_TITLE_REPOS` to your repo letters |
| `scope-nudge.sh` | UserPromptSubmit | When a message links two or more tickets/threads, asks which one defines the job |
| `format-on-edit.sh` | PostToolUse (Edit, Write) | Runs the repo's own Prettier on the edited file |
| `review-trigger.sh` | PostToolUse (Bash) | After `gh pr create --draft`, starts the `pre-pr-review` skill. Set `PRE_PR_REVIEW_OWNERS` to limit it to some GitHub owners |

## Cloud sessions

Claude Code cloud sessions don't read your `~/.claude`. Use a personal cloud environment whose
setup script writes these files and a `~/.claude/CLAUDE.md` that imports them, or clones this repo:

```bash
git clone --depth 1 https://github.com/korawit-ch/agent-instructions.git ~/agent-instructions
mkdir -p ~/.claude
printf '@~/agent-instructions/ENGINEERING.md\n' > ~/.claude/CLAUDE.md
```

Hooks from `~/.claude/settings.json` don't run in cloud sessions.

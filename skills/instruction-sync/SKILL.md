---
name: instruction-sync
description: Sync ~/agent-instructions/ENGINEERING.md and the personal overlay to Codex's copy, check the shared core for personal details, check the optional ChatGPT copies, and regenerate the cloud setup script. Use after editing ENGINEERING.md or the overlay, or when asked to sync, check or update the instructions for Claude, Codex or ChatGPT.
---

# Instruction sync

`~/agent-instructions/ENGINEERING.md` (shared core) and the personal overlay
(`~/agent-instructions-personal.md`, or `$AGENT_INSTRUCTIONS_OVERLAY`) are the sources. Claude
imports both through `~/.claude/CLAUDE.md`; Codex reads a plain copy of both joined at
`~/.codex/AGENTS.md`; ChatGPT gets hand-condensed copies the user pastes; Claude Code cloud
sessions get a generated setup script the user pastes into their cloud environment.

Working files live in `~/.agent-instructions/` (`$AGENT_INSTRUCTIONS_STATE`), outside any public
repo: `leak-patterns.txt` (one regex per line: names, emails, employers, colleagues, private repo
names), the last Codex copy, the optional `chatgpt-custom-instructions.md` and
`chatgpt-memory.md`, `cloud-setup.sh`, and the stamps that keep the checks quiet.

1. Make the edit in `ENGINEERING.md` or the overlay (never in a copy). Personal details go in the
   overlay.
2. Run `~/agent-instructions/skills/instruction-sync/sync.sh`.
3. Act on its output:
   - **STOP: master doesn't start with "# Engineering Instructions"**: it was overwritten. Show
     the user, and restore it (from git or the last Codex copy) only with their OK.
   - **STOP: Codex's copy was edited**: show the user the printed diff and ask what to keep.
     Never overwrite it on your own; that edit came from the Codex app or the user.
   - **WARN long line**: rewrap that line to 100 characters and run the script again.
   - **LEAK**: a personal detail is in the shared core. Move it to the overlay (or reword it,
     e.g. a name → "the user") and run the script again. Add new personal terms to
     `leak-patterns.txt`.
   - **CHECK: master changed since the ChatGPT copies were reviewed**: if the change matters in
     ChatGPT, update the condensed copy by hand. Fields stay at or under 1,500 characters; memory
     items stay short, one fact each. Either way, then run the `touch` command it prints, so the
     check stays quiet until the next change.
   - **CHECK: the cloud setup script changed**: tell the user to paste it into their cloud
     environment's setup script. Run the `touch` command it prints only after they confirm they
     pasted it. The overlay is included only while `.cloud-include-personal` exists; never create
     that file without the user's OK.
   - **CHECK: sources changed since the public copy was last updated** (only with
     `$AGENT_INSTRUCTIONS_PUBLIC` set): the public copy is a sanitized copy of `ENGINEERING.md`,
     `hooks/` and `skills/`. Bring each listed change into it, using the printed diff: rewrite
     personal details and employer specifics (names, emails, colleagues, product and repo names,
     tracker names) as generic text, and decide with the user whether a new file is published.
     Leak-scan the public copy, show the user the diff, and commit and push only when they ask.
     Then run `public-check.sh --accept`. If the user doesn't want the change public, still run
     `--accept` so the check stays quiet.
4. Report: what was synced, any ChatGPT text the user must re-paste (which field or item numbers),
   whether the cloud setup script must be re-pasted, which files the public copy needs, and
   anything the script stopped on.

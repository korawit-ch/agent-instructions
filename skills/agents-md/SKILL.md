---
name: agents-md
description: Create, restructure, or add to a repository's AGENTS.md / CLAUDE.md files. Use when writing repo agent instructions, recording a gotcha, or when an AGENTS.md has grown long.
---

# Repo agent instructions

## Shape of a repo AGENTS.md (root, ideally under ~150 lines)

1. Absolute rules: short, at the top, each with a one-line why. Only rules that must never break.
2. Commands: install, dev, typecheck, lint, test (including a single test), build, DB (local only).
3. Architecture pointer: 5–10 lines plus a link to docs/ARCHITECTURE.md (or equivalent).
4. Conventions that are easy to break: only the non-obvious ones.
5. Gotchas: one line each, with a pointer to detail.

## Placement

- Rules about one area go in that directory's nested AGENTS.md; the root holds cross-cutting
  rules only.
- Changelogs, migration histories, endpoint specs, and incident write-ups go in docs/, with a
  one-line pointer.

## Changing an existing file

- Adding a gotcha: one line, in the nearest relevant file, only after the user approves.
- Restructuring: never delete content. Move it to docs/ or a nested file and leave a pointer.
  Show the plan to the user first. Keep absolute rules verbatim.
- Contradictions: if two rules can't both hold, flag them to the user rather than resolving them
  silently.

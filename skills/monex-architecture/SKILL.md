---
name: monex-architecture
description: The Monex Turbo template as the recommended (not mandatory) reference model for project architecture and code style - a TypeScript monorepo with Next.js + NestJS + Prisma + shared contract/UI packages, optional auth, shared-or-localized ownership, and multiple apps. Use when starting a new project, adding a feature/resource or app, changing project structure, or making an architectural decision in a TypeScript full-stack project that the repo itself doesn't already settle.
---

# Monex architecture (recommended reference)

Template: the Monex Turbo starter template. Put its local path and GitHub repo in your personal
overlay; without it, ask the user where the template is.

## This is a recommendation, not a mandate

Monex is the recommended way to think about structure and code. It is not a target every
project must be converted to. Real projects, including ones that started from Monex, may look
completely different, and the existing structure is legitimate.

- New project: recommend the template and its setup (see "New project"); the user decides.
- A Monex-shaped repo: follow its patterns. Its own AGENTS.md and code win on any detail.
- A repo shaped differently (even if it came from Monex): its structure wins. Use Monex only to
  inform decisions the repo hasn't settled, and only in ways that fit its existing shape.
- Not TS full-stack: don't apply this.

## Never restructure drastically

- Never reorganize a project toward Monex as a side effect of a task. Do the task within the
  current structure.
- If moving toward Monex would genuinely help, recommend it: state the benefit, the cost, and a
  sequence of small, independent steps (one boundary or package per step, each its own commit,
  each leaving the project working). Do nothing structural until the user approves a specific step.
- Prefer the smallest change that solves the real problem over a "make it like the template" rewrite.
- In an existing repo, never propose replacing its core technology (framework, data layer,
  database, auth provider) to match Monex.

## Step 0: detect the variant. Never assume the starter's default shape.

A Monex project is one point in a family of variants (see references/variants.md):
auth on/off · Prisma shared/in-api · assets shared/in-web · number of web/api apps · template
finalized or not. Run `npm run setup -- --status` if it exists, or check the detection paths.
State the detected variant before planning, and plan only with the layers that actually exist.
If the project matches no variant, say so and treat it as a differently shaped repo (see above);
don't treat the gap as something to fix.

## Invariant model

True in every Monex variant. In other repos, use these as review questions, not as required layout.

1. Contracts are the spine: one framework-free contract file per feature in the shared contract
   package (no fetch/React/Next/Nest/Prisma). All apps depend on it; it depends on nothing.
2. One-way dependencies: apps → packages; packages never import apps; no app→app imports.
   Frontend never imports Prisma (not even types). DB models never leave the API: map them.
3. The API is authoritative: validate every body (DTO + strict ValidationPipe). Any policy is
   enforced in the API, never inferred from the client.
4. Shared UI is product-neutral: no routes, API calls, permissions, or icons inside it; callers
   pass content and slots. Styling uses design-system tokens.
5. Config has one owner: read through validating getters; secrets are server-only.

When auth is present, also: the browser talks only to same-origin BFF `/api/*`; take tenant,
role, and ownership from the verified token, never from the body; don't assume the BFF already
checked; scope the final mutation too and verify the affected-row count; tokens never reach
JS-readable places.

## Ownership: where new code goes

Put code at its narrowest real owner (route `_components` → app `components/<domain>` → shared
package). Promote to a shared package only when a second app consumes it. Localize a package
when only one app uses it and independence beats reuse. Moving ownership never changes a
boundary rule; it only changes where the code lives.

## Changing the structure

Only after the user has asked for a structural change or approved a specific step.
Never hand-move what a template script does. Use `npm run setup` or the specific script:
preview (dry run) → show the user → apply with confirmation → one `npm install` → verify.
Work from a clean branch, one migration per commit, in the order auth → Prisma → assets → duplicate.
These are architecture decisions: ask the user, don't choose for them. Never run
`template:finalize` until the Link example has been replaced. Source changes never touch the DB;
run push/migrate/seed separately, after confirming the target environment.

## New project

Recommend the template (the user may choose otherwise). If they accept: clone it, ask the user
the setup questions (auth? Prisma shared or in the API? assets shared or in the web app? how many
extra web/api apps?), and run `npm run setup` (use `--dry-run` first). Keep the Link slice as a
learning example until real features replace it.

## Feature work

- Follow references/feature-recipe.md for the detected variant; it carries example code for each
  layer, so it still works after `template:finalize` removes the Link example.
- Follow references/conventions.md for code style.
- Check references/known-template-flaws.md before copying a pattern.

## Source

The template repo is the ground truth. Read its AGENTS.md files and docs/engineering/*
(especially scripts-and-template-customization.md); they win over this skill. If they disagree
with the current code, say so.

# Monex variants

`npm run setup` (scripts/setup-project.mjs) shapes a project along four independent axes, plus a
lifecycle stage. `npm run setup -- --status` prints the detected state. The boundaries never
change between variants; only where code lives changes.

| Axis | Detect | Default | Alternative | What changes for code |
|---|---|---|---|---|
| Auth | `apps/api/src/auth` exists | present | removed (`auth:remove`) | Present: `packages/authorization`, global JWT + permission guards, `@RequirePermission`, BFF routes in `apps/web/app/api/*`, tenant scoping, `capabilities` in responses. Removed: no BFF; web fetch helpers call `NEXT_PUBLIC_API_URL` directly; no tenant ownership; any new policy must be built in the API. |
| Prisma | `packages/prisma/package.json` vs `apps/api/prisma/schema.prisma` | shared `@repo/prisma` | in `apps/api` (`prisma:localize:api`) | Schema/seed location and which workspace runs `db:*`. The rule "frontend never imports Prisma" holds in both. |
| Assets | `packages/assets/package.json` vs `apps/web/assets` | shared `@repo/assets` | in `apps/web` (`assets:localize:web`) | Icon import path. `@repo/ui` and `@repo/design-system` stay shared. |
| Apps | `ls apps/` | `web` + `api` (+ `db`) | extra copies (`app:duplicate --source web|api --name X`) | Each copy has its own data access, BFF routes, and modules, and inherits the Link example. The contract package becomes the coordination point across apps. |
| Lifecycle | `scripts/setup-project.mjs` and `apps/api/src/links` exist | template (Link example + one-time tooling) | finalized (`template:finalize`) | Finalized: no example slice in the repo, so use feature-recipe.md and docs/engineering instead. |

## Rules from the scripts

- Keep a package shared while 2+ apps consume it. Localize it when one app owns it and
  independent deployment matters more than reuse. There is no "combine everything" command:
  re-centralize one responsibility at a time, in its own commit.
- Mutation order: auth removal → Prisma localization → asset localization → app duplication →
  one `npm install` → env distribution.
- Every mutation previews by default and needs `--apply` plus an exact confirmation phrase
  (`REMOVE AUTH`, `LOCALIZE PRISMA`, `LOCALIZE ASSETS`, `CREATE`, `FINALIZE TEMPLATE`).
- The setup assistant is an orchestrator, not a transaction: if a step fails, earlier applied
  steps stay applied. Check `git status` before retrying.
- None of these scripts touch database data. `db:push`, `db:migrate`, and `db:seed` are separate.

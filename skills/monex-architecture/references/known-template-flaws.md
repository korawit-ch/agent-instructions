# Known template flaws: don't copy these

Found while analyzing the template on 2026-10-19. Check whether each one still holds before
relying on this list; fix the pattern in new code rather than copying it.

- **No exception filter or Prisma error mapping.** A duplicate `@@unique([tenantId, url])` hits
  Prisma P2002 and returns a 500. Map known DB errors to 409/400 (see feature-recipe.md step 4).
- **The without-auth variant also removes the global ValidationPipe.** Validation isn't an auth
  concern; keep strict validation (whitelist, forbidNonWhitelisted, transform) in every variant.
- **Without-auth server helpers log errors and return empty/null.** Don't read that as a real
  "empty" or "not found".
- **Demo `delay()` calls** in the link query hooks (artificial 600–800 ms).
- **`&&` on non-boolean values and `!!value`** in `page.tsx` and `links.client.ts`, which break
  the template's own rendering rules.
- **`getLink()` is typed `| null`, but `serverFetch` throws on 404.** Make return types honest.
- **The API TypeScript preset turns off `strictNullChecks` and `noImplicitAny`**, against the
  coding standards. Write null-safe code anyway.
- **Boundary rules are docs-only.** No lint rule enforces "packages never import apps" or
  "frontend never imports Prisma". Consider `no-restricted-imports`.
- **Tailwind v4 classes like `bg-surface` and `border-border` may generate no CSS**, because the
  variables are declared without the `--color-` prefix and default colors are reset (INFERRED;
  not verified with a build).
- **Stale paths in nested AGENTS.md files** (`services/`, `queries/`, which are actually
  `data-access/`; demo files that moved to `app/(protected)/(home)/_components/`).
- **`links.controller.spec.ts` mocks `findUnique`/`update`/`delete`**, but the service calls
  `findFirst`/`updateMany`/`deleteMany`.
- **A legacy root `.eslintrc.mjs`** sits beside `eslint.config.mjs`, and empty leftover folders
  (`packages/api-definition`, `packages/icons`) hold only build output.

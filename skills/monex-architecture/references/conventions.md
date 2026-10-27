# Monex code conventions

Source: the template's docs/engineering/coding-standards.md, AGENTS.md files, and code.

## Files and naming
- Kebab-case file names. DTOs: `<action>-<entity>.dto.ts`; mappers: `<entity>.mapper.ts`;
  web data access: `<feature>.server.ts` / `<feature>.client.ts`. API feature folders and files
  are plural (`links/links.service.ts`).
- Functions: mappers `toXxxResponse`; hooks `useXxxQuery` / `useXxxMutation`; query keys `xxxKeys`.

## Exports and imports
- Named exports everywhere except Next.js pages and layouts.
- The contract package has one barrel (`src/index.ts`). `@repo/ui` has no barrel: deep-import
  (`@repo/ui/button`, `@repo/ui/form/form-input`). Icons come from `@repo/assets/icons` (generated).
- No path aliases are configured; the web app uses relative imports.

## React and Next.js
- Server Components by default; `'use client'` only where hooks or events need it.
- Route-private UI in `_components/`; shared app UI in `components/<domain>/`; never `components/common`.
- Styling: `cn` from `@repo/ui/utils` and design-system tokens (e.g. `text-desktop-body1`,
  `primary-500`). Tailwind v4 is configured in CSS `@theme`, with default colors reset.
- Never nest ternaries. For 3+ states use `switch` with an `assertNever` exhaustiveness check.
- Don't use `&&` on non-boolean values or `!!value` in rendering logic; compare explicitly.
- Forms: Zod schemas with `useCustomForm` and `FormWrapper` from `@repo/ui/form/*`; give fields
  stable IDs.

## API (NestJS)
- Feature folder: module, controller, service, mapper, `dto/`, specs beside the source.
- DTOs `implements` the contract request type, with class-validator and `@ApiProperty` on every field.
- Services throw Nest HTTP exceptions (`NotFoundException`, `ForbiddenException`, `ConflictException`).
- Swagger is served at `/api` outside production.

## Config and env
- One root `.env`, linked into workspaces by `env:distribute`. New variables go in `.env.example`
  and in `globalEnv` in `turbo.json`.
- Read config through validating getters; secrets need at least 32 bytes; web config modules are
  `server-only`. Never `NEXT_PUBLIC_*` for backend URLs or secrets.

## TypeScript and lint
- Base preset: strict with `noUncheckedIndexedAccess`.
- ESLint errors: `eqeqeq`, `no-debugger`, unused vars (prefix `_` to exempt). Packages lint with
  `--max-warnings 0`. Prettier: single quotes plus the Tailwind plugin.

## Tests
- API: Jest via `@repo/jest-config`, `*.spec.ts` beside the source, `PrismaService` mocked with
  `useValue: { client: { ... } }`; e2e tests in `apps/api/test`.
- Web: jsdom + ts-jest, `*.test.ts(x)`.

## Git
- Commits: `type(scope): summary`. Scope required (lower/kebab-case). Types: build, chore, docs,
  feat, fix, refactor, test, release. The pre-commit hook runs lint-staged and `turbo check-types`.
- Branch from `develop` as `feature/…` (never `feat/`). PR titles: `[PROJECT-123] …` or `[TBD] …`.

## Safety
- One lockfile (npm). Never hand-edit generated output (Prisma client, `dist`, `.next`,
  `packages/assets/src/icons/index.ts`).
- Scripts with `--apply` are preview-first; always run the preview first.
- Never use a database reset or volume removal as routine verification.

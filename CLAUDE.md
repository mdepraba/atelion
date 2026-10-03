# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Atelion is a private modular monolith: one Bun process (NestJS on Fastify), one
PostgreSQL database, one deploy, and a React SPA. Modules own their data and
talk to each other only through their `contracts` package. The product spec is
`docs/prd/Homebase — Personal Modular Monolith PRD.md`. Code comments cite its
IDs (`US-`, `FR-`, `BR-`, `EC-`, `NFR-`), so look a rule up there before
implementing or changing behaviour it governs.

## Commands

Bun installs packages and runs the server; Nx, Vite, Vitest and esbuild run on
Node 24, so both must be installed.

```sh
bun install
bun run dev:api          # API on http://127.0.0.1:3000, esbuild --watch + bun --watch
bun run dev:web          # SPA on http://localhost:4200, proxies /api and /health to :3000

bun run check            # Biome lint + format (check:fix to apply)
bun run boundaries       # module boundary rules; boundaries:test runs their node:test suite
bun run secrets          # env files and hard-coded secrets in tracked files; secrets:test for the rules
bun run typecheck        # all projects
bun run test             # all projects
bun run build

bunx nx affected -t typecheck test build   # only what the change touched
bunx nx sync             # regenerate tsconfig project references
```

Single project or test (project names are the package names, e.g.
`@fiscus/domain`, `@app/api`; `bunx nx show projects` lists them):

```sh
bunx nx test @fiscus/domain                    # one project
bunx nx test @fiscus/domain -- budget          # files matching "budget"
bunx nx test @fiscus/domain -- -t "rolls over" # tests matching a name
bunx nx typecheck @fiscus/domain
bunx nx check @fiscus/domain                   # Biome scoped to one project
```

CI (`.github/workflows/ci.yml`) runs, in order: `nx sync:check`, `boundaries`
and `boundaries:test`, `secrets` and `secrets:test`, `biome ci .`, then
`nx affected -t typecheck test build`.
TypeScript project references in the `tsconfig*.json` files are generated from
the Nx graph: after adding or removing a workspace dependency in a
`package.json`, run `bunx nx sync` and commit the result or CI fails.

### Git hooks

`bun install` installs Husky hooks (`.husky/`):

- `commit-msg` runs commitlint: messages follow Conventional Commits,
  `type(scope): subject`, e.g. `feat(fiscus): add pay-cycle rollover`.
- `pre-commit` runs `tools/secrets/check-secrets.mjs --staged` over the index.
  It rejects `.env` files (only `.env.example` may be committed), PKCS#12 and
  SSH key files, provider tokens, credentials in URLs, and literals assigned
  to secret-named variables. Rules are in `tools/secrets/rules.mjs`. Put
  `secret-scan: allow` on a line to accept a reviewed false positive, such as
  a sample token in a test.

## Architecture

`docs/architecture/README.md` says where code goes: business rules are pure
functions in `domain`, the `api` package is the shell that loads, decides and
saves, and ports exist only at external edges (not full hexagonal; the reasons
are in ADR-0001 beside it). `docs/architecture/tech-stack.md` lists every
library and its status; one marked *Proposed* needs the owner's sign-off
before `bun add`.

### Projects and how they are wired

- `apps/api` bundles with esbuild into `apps/api/dist/main.js` and runs under
  Bun. `app.module.ts` imports `CoreModule` and each module's Nest module by
  hand (the module registry, FR-07, is meant to replace that list).
- `apps/web` is a Vite SPA. `app.tsx` lazy-imports each module's `web` package
  (its default export is the module's screen) so module code stays out of the
  shell's first-load bundle (NFR-24: ≤ 200 KB gzipped).
- `apps/converter` is a separate esbuild bundle for the PDF converter, started
  by systemd per job, with no network or database access (FR-72).
- `core/api` (Nest platform services), `core/db` (client, migrations),
  `core/ui` (design system, `Shell`).
- `modules/<name>/{contracts,domain,api,web}`; `modules/devtools` is web only.

Libraries have no build step: every library's `package.json` `exports` points
straight at `src/index.ts(x)`, and the apps bundle them. Workspaces are listed
explicitly in the root `package.json`, so a new module folder must be added
there before `bun install` will link it.

A new project needs exactly one `scope:<module>` tag and one
`type:app|core|contracts|domain|api|web` tag under `nx.tags` in its
`package.json`; `bun run boundaries` rejects anything else. (PRD 5.4 calls the
server-side type `server`; the code uses `api`.)

The PRD's **Expenses** module is `fiscus` in code: `modules/fiscus`,
`@fiscus/*`, `scope:fiscus`, token scopes `fiscus:*`, events `fiscus.*` and the
`fiscus` database schema. "Expense" as a transaction type (BR-02) keeps its
name.

### Boundary rules (`tools/boundaries/rules.mjs`)

Checked over the Nx project graph, since Biome has no boundary rule:

- nothing imports an app
- modules import other modules only through their `contracts`
- `contracts` imports no workspace project; `domain` imports only `contracts`
  and no framework package (Nest, Fastify, React, Drizzle, postgres, pg-boss)
- `core` imports no module
- web-side code (`type:web`, `@core/ui`, `@app/web`) imports no server project
  or server package
- `@app/converter` imports only `contracts` and no database package

### Two TypeScript setups

- Server-side and shared projects (`api`, `core/api`, `core/db`, `contracts`,
  `domain`, `apps/converter`) use `module: nodenext`: relative imports need a
  `.js` suffix (`./core.module.js`).
- Web projects use `moduleResolution: bundler` with `react-jsx`: no suffix.

### NestJS dependency-injection pitfalls

- esbuild does not emit `emitDecoratorMetadata`, which Nest DI depends on.
  `tools/esbuild/swc-decorator-metadata.cjs` runs `.ts` through SWC first;
  `apps/api/esbuild.config.cjs` wires it in. Do not remove it.
- In Nest projects never turn a class import used for injection into
  `import type`: the type is the DI token and must exist at runtime. That is
  why `biome.json` turns off `useImportType`, `noUnusedFunctionParameters` and
  import organising for `apps/api/**`, `core/api/**` and `modules/*/api/**`.
  A new Nest project outside those globs needs the same override, plus
  `experimentalDecorators` and `emitDecoratorMetadata` in its tsconfig.
- Every rule disabled in `biome.json` must have its reason recorded in
  `docs/lint-decisions.md`.

## Constraints from the PRD

- The production host is 1 vCPU / 1 GB; Atelion's RSS target is ≤ 180 MB
  (NFR-01). Weigh every new runtime dependency against that. The host never
  builds; CI does (NFR-22).
- The API binds to `127.0.0.1` because only `tailscale serve` reaches it
  (FR-01); request bodies are capped at 32 MB (NFR-07).
- Nothing personal goes in the repo: salary, budget amounts and secrets live
  in database settings or `/srv/atelion/.env`.
- Logs never contain tool input, file names or transaction notes (NFR-13).

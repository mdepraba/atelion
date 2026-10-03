# Atelion

A private modular monolith: one Bun process, one PostgreSQL database and one
deploy, with modules that own their data and talk to each other only through
their `contracts`. The product spec is in [docs/prd](docs/prd).

## Layout

| Folder | Package | What it holds |
| --- | --- | --- |
| `apps/api` | `@app/api` | Nest on Fastify entry point; loads every module |
| `apps/web` | `@app/web` | SPA shell; module screens load on demand |
| `apps/converter` | `@app/converter` | Entry point for the PDF converter unit |
| `core/api` | `@core/api` | Auth, tokens, registry, jobs, files, events, audit |
| `core/db` | `@core/db` | Database client, migration runner |
| `core/ui` | `@core/ui` | Design system shared by every module |
| `modules/devtools` | `@devtools/web` | Browser-only dev tools, one folder per tool |
| `modules/fiscus/*` | `@fiscus/{contracts,domain,api,web}` | Ledger, pay cycles, budgets |
| `modules/pdf/*` | `@pdf/{contracts,api,web}` | PDF tools and the server job queue |

Every project is tagged `scope:<module>` and `type:app|core|contracts|domain|api|web`.
`bun run boundaries` enforces the rules in [tools/boundaries/rules.mjs](tools/boundaries/rules.mjs):

- modules import each other only through `contracts`
- `domain` imports no framework
- `core` imports no module
- browser code imports no server code
- the converter reaches nothing but `contracts`

## Commands

Requires [Bun](https://bun.sh) and Node 24. Nx, Vite and Vitest run on Node.

```sh
bun install

bun run dev:api          # server on http://127.0.0.1:3000, rebuilt on change
bun run dev:web          # shell on http://localhost:4200, proxying /api

bun run check            # Biome lint + format check (check:fix to apply)
bun run boundaries       # module boundary rules (boundaries:test for their tests)
bun run secrets          # no env files or secrets in tracked files (secrets:test)
bun run typecheck
bun run test
bun run build

bunx nx affected -t typecheck test build   # only what a change touched
bunx nx sync             # regenerate TypeScript project references
```

`bun install` also sets up Git hooks: commit messages must follow
[Conventional Commits](https://www.conventionalcommits.org) (`feat(pdf): add
merge tool`), and a commit that stages a `.env` file or a hard-coded secret is
rejected. Mark a reviewed false positive with `secret-scan: allow` on the line.

How code is organised inside a module, and why, is in
[docs/architecture](docs/architecture/README.md), with the tech stack in
[docs/architecture/tech-stack.md](docs/architecture/tech-stack.md). Disabled
lint rules and their reasons are in
[docs/lint-decisions.md](docs/lint-decisions.md).

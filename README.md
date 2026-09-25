# SeShaKart

**SeShaKart Pvt. Ltd.** — _Smart Shopping, Better Living_ · [www.seshakart.com](https://www.seshakart.com)

Production e-commerce platform for the Indian market: a Next.js storefront and admin,
a NestJS REST API that web and future mobile apps share, and PostgreSQL plus Redis for
data and caching.

> **Status:** Phases 1–3 are complete: architecture, the design system and the brand, and the
> database and backend foundation. See the
> [roadmap](#roadmap) for what comes next.

## Repository layout

```
apps/
  web/            Next.js 15 (App Router, React 19, Tailwind) — storefront + /admin
  api/            NestJS 11 REST API — all business logic, pricing, inventory, payments
packages/
  types/          Shared API contracts and domain types (@seshakart/types)
  validation/     Shared Zod schemas used by web forms AND the API (@seshakart/validation)
  ui/             Design system: tokens, Tailwind preset, accessible React components (@seshakart/ui)
  tsconfig/       Shared TypeScript presets
  eslint-config/  Shared ESLint flat config
brand/            Brand reference board + master logo files
docs/             Architecture, environment, brand and (later) API/DB/deploy docs
infra/            Dockerfiles and docker-compose (dev services + full stack)
.github/          CI workflows
```

## Requirements

- Node.js 22 (see `.nvmrc`; 20.11+ works)
- pnpm 10 (`corepack enable`)
- PostgreSQL 16 and Redis 7. `pnpm infra:up` starts both with Docker. Redis is optional locally.

## Getting started

```bash
corepack enable
pnpm install
pnpm infra:up                 # PostgreSQL + Redis (Docker)
cp .env.example .env          # set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
pnpm db:deploy                # apply database migrations
pnpm build                    # build packages, API and web
pnpm db:seed                  # default settings + first super admin
pnpm dev                      # web on :3000, API on :4000
```

- Storefront: http://localhost:3000
- Design system reference: http://localhost:3000/design-system (development only)
- API health: http://localhost:4000/api/health. The same endpoint is also served through the web proxy at http://localhost:3000/api/health.

## Common commands

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `pnpm dev`          | Build shared packages, run API and web in watch mode     |
| `pnpm build`        | Production build of packages, API and web                |
| `pnpm test`         | Unit and integration tests in every workspace            |
| `pnpm lint`         | ESLint in every workspace                                |
| `pnpm typecheck`    | TypeScript in every workspace                            |
| `pnpm format`       | Prettier                                                 |
| `pnpm infra:up`     | Start local PostgreSQL and Redis (Docker)                |
| `pnpm brand:assets` | Regenerate the provisional logo set from the brand board |
| `pnpm db:migrate`   | Create and apply a migration (development)               |
| `pnpm db:deploy`    | Apply pending migrations                                 |
| `pnpm db:check`     | Fail if migrations and schema.prisma disagree (CI)       |
| `pnpm db:seed`      | Idempotent base seed                                     |
| `pnpm db:studio`    | Browse data with Prisma Studio                           |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) covers system design, key decisions and the phase plan.
- [Environment](docs/ENVIRONMENT.md) lists every environment variable.
- [Database](docs/DATABASE.md) covers the data model, constraints, migrations and seed.
- [Brand design system](docs/BRAND_DESIGN_SYSTEM.md) covers the logo, colour, type, components and accessibility rules.
- [Brand assets](brand/README.md) covers the logo files and the status of the brand reference.
- [Brand identity brief](docs/brand/brand-identity-brief.md)

These docs arrive in the phases that introduce the matching features: `API.md`,
`DEPLOYMENT.md`, `SECURITY.md`, `TESTING.md` and `ADMIN_GUIDE.md`.

## Roadmap

| Phase | Scope                                | Status  |
| ----- | ------------------------------------ | ------- |
| 1     | Architecture & repository setup      | ✅ Done |
| 2     | Design system & brand implementation | ✅ Done |
| 3     | Database & backend foundation        | ✅ Done |
| 4     | Authentication & customer system     | Next    |
| 5     | Product / catalog / category system  |         |
| 6     | Search & filtering                   |         |
| 7     | Cart & wishlist                      |         |
| 8     | Checkout & payment architecture      |         |
| 9     | Orders & shipping                    |         |
| 10    | Admin dashboard                      |         |
| 11    | SEO & analytics                      |         |
| 12    | Performance & security               |         |
| 13    | Testing (E2E)                        |         |
| 14    | Production deployment preparation    |         |

## Contact

SeShaKart Pvt. Ltd. · durvesh15aug@gmail.com · +91 8218397819

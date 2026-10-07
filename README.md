# Deadlockprohunger

An unofficial community analytics and strategy platform for Deadlock.
**DATA → INSIGHT → DECISION → ACTION.** Deep like an analyst tool, simple like a modern consumer product.

> Deadlockprohunger is an unofficial fan project. It is not affiliated with or endorsed by Valve. Deadlock and related marks are property of Valve Corporation. Game data provided by [deadlock-api.com](https://deadlock-api.com).

## What's in it

Home, Meta, Heroes, Hero Detail, Builds, Build Detail, Matches, Match Detail, Players, Player profiles, Leaderboard, Analyze, Compare and Draft Lab, all on live data from the Deadlock API. Every statistic carries its scope (window, rank band, sample size), and small samples are never presented as conclusions.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 6 · Tailwind CSS v4 · zod · Drizzle + PostgreSQL (optional) · Vitest · Oxlint

## Getting started

```bash
npm install
cp .env.example .env.local   # every variable is optional
npm run dev                  # http://localhost:3000
```

Without any environment variables the site runs on the public API with no database.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run check` | Typecheck + lint + tests + build (the gate before every merge) |
| `npm test` | Unit tests (Vitest) |
| `npm run api:verify` | Checks every API call against the live OpenAPI spec |
| `npm run db:migrate` | Applies database migrations (needs `DATABASE_URL`) |

## Deployment (Vercel)

| Where | Name | Purpose |
|---|---|---|
| Vercel env | `CRON_SECRET` | Protects `/api/cron/*` (database jobs and the cache prewarm). Long random value; never commit it |
| Vercel env | `DEADLOCK_API_KEY` (optional) | Higher Deadlock API limits |
| Vercel env | `DATABASE_URL` (optional) | Postgres history and fallbacks |
| GitHub Actions secret | `CRON_SECRET` | Same value as on Vercel; used by the hourly prewarm workflow |
| GitHub Actions variable | `SITE_URL` | Production origin the prewarm workflow calls |

Cache prewarming runs hourly from `.github/workflows/prewarm.yml` (Vercel Hobby crons are daily-only), with a daily Vercel cron as backup. Details: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) § Cache prewarming.

## Documentation

Planning and audit docs live in [`docs/`](./docs): product, architecture, routes, data model, API, design system, roadmap, plus QA, performance, accessibility and mobile audits. Contributor guidance for AI-assisted work is in [`CLAUDE.md`](./CLAUDE.md).

# CrewForge

Race-proof team formation for Hack4Hack Crew Hiring Challenge 2026, **PS1**. The challenge asks entrants to choose one problem statement; this entry focuses on the complete PS1 workflow.

[Live app](https://crewforge-abrar-h4h.soaringmonk2.chatgpt.site) · [Source](https://github.com/PattanAbrarMalik/crewforge) · [Validation report](docs/VALIDATION.md) · [One-page design](docs/CrewForge-design.pdf)

The app and repository currently require owner access. Judge access must be enabled before submission.

## What works

- Authenticated profiles and a searchable, cursor-paginated team board.
- Team creation with event size rules and a hard capacity limit.
- One team per person per event, even under simultaneous requests.
- 128-bit expiring invite codes, rotation, and persistent attempt limits.
- Join requests; only the current leader can accept, decline, remove members, or change recruiting status.
- Automatic oldest-member leadership succession and automatic empty-team deletion.
- Idempotent writes, atomic audit history, SSE revision updates, optimistic recruiting controls with rollback.
- Explainable suggestions: 70 points for complementary skills and 30 for circular timezone proximity.
- Responsive, keyboard-operable React interface and isolated sandbox personas.

## Run locally

Requirements: Node 24 and npm. The exact dependency tree is locked in `package-lock.json`.

```sh
npm ci
npm run typecheck
npm test
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_good_spiral.sql
npm run dev
```

The framework development server provides a local-only identity. Production uses the hosting gateway's immutable authenticated user ID; there is no production test-header bypass. Choose Sandbox to explore the seeded sample workspace, or Live workspace to create a real profile.

For later schema versions, apply only pending migration files in journal order. Hosted deployment applies committed migrations automatically.

## Verification

```sh
npm test              # real workerd + SQLite integration suite
npm run test:load     # 10,000 people, 2,000 teams, 100 connections
npm run test:chaos    # SIGKILL after commit, restart and replay
```

`tests/worker.ts` is an isolated test adapter. It is never imported into production. Load results are written to `reports/load.json`; restart results to `reports/chaos.json`. The tests use separate local databases and never seed the live event with synthetic scale data. The GitHub Actions workflow runs type checking, integration tests, and the crash-recovery test. Docker Compose provides the same integration, load and recovery runners; Docker execution was not verified in this environment.

## Architecture

React + Vinext on a Cloudflare Worker, with D1/SQLite persistence. See [DESIGN.md](DESIGN.md) for the consistency boundary, security model, tradeoffs, and limits. See [docs/API.md](docs/API.md) for request contracts and [docs/DEMO.md](docs/DEMO.md) for the five-minute walkthrough.

Database triggers and constraints enforce the core invariants independently of HTTP request ordering. All mutation checks, changes, idempotency receipts, and audit rows commit in one D1 batch transaction. SSE communicates revisions, not private payloads; clients refetch authorized views.

## Submission material

- Source repository: https://github.com/PattanAbrarMalik/crewforge (private until judge access is authorized).
- Live demo: https://crewforge-abrar-h4h.soaringmonk2.chatgpt.site (private until judge access is authorized).
- One-page design: `docs/CrewForge-design.pdf` (editable text in `DESIGN.md`).
- Measured load report: `reports/load.json` and `docs/VALIDATION.md`.
- Walkthrough: follow `docs/DEMO.md` and record a video under five minutes.

No rank, judging outcome, hosted performance figure, public GitHub publication, or video submission is claimed unless actually completed and verified. The developer should be able to explain the implementation, especially the SQL transaction and trigger semantics.

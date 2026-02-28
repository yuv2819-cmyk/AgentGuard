# AgentGuard MVP Monorepo

Demo-quality AgentSecOps control plane SaaS with policy enforcement, agent key management, simulation, and tamper-evident audit logs.

## Monorepo Layout

```text
apps/
  api/         Express + TypeScript + Prisma + PostgreSQL
  web/         Next.js App Router + Tailwind + TypeScript
packages/
  shared/      Shared types
```

## Architecture Overview

- `apps/api`: REST API (`/v1`) with JWT user auth, `X-Agent-Key` agent auth, policy engine, key rotation, kill-switch, human approvals, SIEM webhooks, and hash-chain audit ledger.
- `apps/web`: Marketing + product UI routes (`/app/*`) for workspaces, agents, policies, approvals, simulate, audit logs, and integrations.
- `packages/shared`: Shared domain types (`PolicyRules`, evaluation result types, common enums).
- `PostgreSQL`: Multi-tenant workspace data model with `jsonb`, `timestamptz`, and GIN indexes.

## Key Features Implemented

- Email/password signup/login with JWT
- Multi-tenant workspaces + membership roles (`OWNER`, `MEMBER`) with granular permission checks
- Workspace member management endpoints (owner-managed role assignment)
- Agent CRUD with one-time raw API key display (stored as salted SHA-256 hash)
- Agent kill-switch (`DISABLED`) that blocks all key-auth requests and logs them
- API key rotation + revoke old keys + `last_used_at`
- Policy CRUD and assignment to agent (`STRICT`/`BALANCED`)
- Policy versioning + approval workflow (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`)
- Signed policy approvals (stored payload hash + signature records)
- Policy-as-code sync configuration + import runs from Git metadata payloads
- Policy engine: deny-overrides-allow, strict unknown blocking, anomaly signals (`high_risk_action`, `burst_rate`, `unknown_tool`)
- Human-in-the-loop approvals for high-risk actions with expiring approval requests
- Risk scoring v2 with behavior baseline drift + off-hours/new-pattern signals
- SIEM generic webhook integrations with optional HMAC signature header
- Runtime-native provider connections and enforcement path (`OPENAI`, `ANTHROPIC`, `LANGCHAIN`, `CREWAI`)
- Enterprise SSO providers + SCIM lifecycle token provisioning + JIT membership
- Custom RBAC overrides per role and permission
- Automated response playbooks with execution history
- Forensics replay endpoints for hash-chain timeline integrity checks
- Compliance evidence pack generation (SOC2/ISO27001/HIPAA/GDPR) with immutable SHA256 digest
- Public trust center API + attestations
- Deployment profile endpoint for region/private mode awareness
- User simulation endpoint and agent runtime endpoint
- Tamper-evident audit log hash chain (`prev_hash`, `hash`, chain state table)
- Audit log filters + CSV export endpoint
- Frontend dashboard routes with loading states, empty states, detail drawer, key copy UX, and timezone toggle (default `Asia/Kolkata`)

## API Contract

Base path: `/v1`

Implemented endpoints:

- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/sso/login`
- `GET /workspaces`
- `POST /workspaces`
- `GET /workspaces/:id/members`
- `POST /workspaces/:id/members`
- `GET /rbac/permissions`
- `PUT /rbac/permissions`
- `GET /agents`
- `POST /agents`
- `GET /agents/:id`
- `PATCH /agents/:id`
- `POST /agents/:id/disable`
- `POST /agents/:id/keys/rotate`
- `GET /policies`
- `POST /policies`
- `GET /policies/:id`
- `PATCH /policies/:id`
- `GET /policies/:id/versions`
- `POST /policies/:id/submit-approval`
- `POST /policies/:id/approve`
- `POST /policies/:id/reject`
- `GET /policies/:id/signatures`
- `GET /policy-sync/config`
- `PUT /policy-sync/config`
- `GET /policy-sync/runs`
- `POST /policy-sync/sync`
- `POST /agents/:id/assign-policy`
- `POST /simulate`
- `POST /agent/actions`
- `GET /runtime/connections`
- `POST /runtime/connections`
- `PATCH /runtime/connections/:id`
- `DELETE /runtime/connections/:id`
- `POST /runtime/:provider/actions`
- `GET /audit-logs`
- `GET /audit-logs/export.csv`
- `GET /forensics/replay`
- `GET /forensics/replay/:eventId`
- `GET /approvals`
- `POST /approvals/:id/approve`
- `POST /approvals/:id/reject`
- `GET /playbooks`
- `POST /playbooks`
- `PATCH /playbooks/:id`
- `DELETE /playbooks/:id`
- `GET /playbooks/executions`
- `GET /integrations`
- `POST /integrations/webhook`
- `DELETE /integrations/:id`
- `GET /sso/providers`
- `POST /sso/providers`
- `PATCH /sso/providers/:id`
- `DELETE /sso/providers/:id`
- `GET /scim/tokens`
- `POST /scim/tokens`
- `DELETE /scim/tokens/:id`
- `GET /scim/v2/Users`
- `POST /scim/v2/Users`
- `PATCH /scim/v2/Users/:id`
- `DELETE /scim/v2/Users/:id`
- `GET /compliance/evidence-packs`
- `POST /compliance/evidence-packs`
- `GET /compliance/evidence-packs/:id/download.json`
- `GET /trust-attestations`
- `POST /trust-attestations`
- `PATCH /trust-attestations/:id`
- `GET /public/trust-center`
- `GET /deployment/profile`

## Database

Prisma schema and SQL migration are in:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260226000000_init/migration.sql`
- `apps/api/prisma/migrations/20260226010000_buyer_features/migration.sql`

Includes required indexes:

- unique `users.email`
- unique `(workspace_id, user_id)` membership
- unique `agent_api_keys.key_hash`, index `agent_id`
- audit indexes `(workspace_id, created_at desc)`, `(agent_id, created_at desc)`, GIN on `metadata`
- optional GIN on `policies.rules`

## Local Setup (Node)

### Quick Start (Recommended)

```bash
npm install
npm run dev:local
```

`dev:local` starts an embedded PostgreSQL instance, applies migrations, seeds demo data, and launches API + web.

It automatically picks open ports if `3000` (web) or `4000` (api) are occupied, then prints the exact URLs to open.

### Manual Setup

### 1) Install

```bash
npm install
```

### 2) Configure env files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### 3) Run DB migration + seed

```bash
npm run db:generate
npm run db:migrate:dev
npm run db:seed
```

### 4) Start web + api

```bash
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000/v1`

### One-command local stack (no Docker Desktop required)

If Docker is unavailable, run:

```bash
npm run dev:local
```

This starts an embedded PostgreSQL instance, applies migrations, seeds demo data, and launches API + web. Use the URLs printed in terminal (ports may auto-shift if already in use).

## Docker Local Dev

```bash
docker-compose up --build
```

Runs postgres + api + web.

## Private Deployment Profile (Single-Tenant)

For private-mode demos:

```bash
docker-compose -f docker-compose.yml -f docker-compose.private.yml up --build
```

This enables `PRIVATE_DEPLOYMENT_MODE=true` and isolated service naming suitable for single-tenant/VPC-style topologies.

## Demo Seed Credentials

- Owner email: `admin@agentguard.demo`
- Member email: `analyst@agentguard.demo`
- Password (both): `Admin123!ChangeMe`
- Demo SCIM token: `scim_demo_token_1234567890abcdef`
- Demo SSO shared secret: `sso_demo_shared_secret_change_me`
- Seed includes:
  - workspace (`Asia/Kolkata`)
  - two agents (ACTIVE + DISABLED)
  - two policies (Read-only + Strict)
  - one SSO provider + one SCIM token
  - one runtime provider connection
  - one automated response playbook
  - one public trust attestation
  - audit events

## Testing

```bash
npm run test
```

Backend tests:

- unit: policy engine, hash chain, key hashing helpers
- integration: health and auth/agent-auth guard behavior

Frontend tests:

- minimal component test for `Button`

## Lint & Build

```bash
npm run lint
npm run build
```

## Deployment

### Vercel (web)

Deploy `apps/web` as a Vercel project.

Environment variable:

- `NEXT_PUBLIC_API_URL=https://<render-api-domain>/v1`

Build/install commands (already defined in `apps/web/vercel.json`):

- install: `npm install`
- build: `npm run build --workspace @agentguard/shared && npm run build --workspace @agentguard/web`

### Render (api + db)

`render.yaml` is provided at repo root.

Steps:

1. Create Blueprint deployment from this repo.
2. Render provisions `agentguard-postgres` database.
3. API service receives `DATABASE_URL` from Render Postgres connection string.
4. Set `CORS_ORIGIN` to your Vercel domain.

Runtime start command runs migrations before API start.

## Useful Scripts

- `npm run dev`
- `npm run dev:local`
- `npm run db:migrate:dev`
- `npm run db:seed`
- `npm run lint`
- `npm run test`
- `npm run build`

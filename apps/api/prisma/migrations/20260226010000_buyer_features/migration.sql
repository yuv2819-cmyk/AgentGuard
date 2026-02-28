-- Create enums
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "IntegrationType" AS ENUM ('GENERIC_WEBHOOK');

-- Alter policies for approval workflow and versioning
ALTER TABLE "policies"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "submitted_by_user_id" UUID,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "approved_by_user_id" UUID,
  ADD COLUMN "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "rejection_reason" TEXT;

-- Backfill existing policies as approved so current assignments remain valid
UPDATE "policies"
SET "status" = 'APPROVED',
    "approved_at" = COALESCE("approved_at", CURRENT_TIMESTAMP)
WHERE "status" = 'DRAFT';

-- Policy versions table
CREATE TABLE "policy_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "mode" "PolicyMode" NOT NULL,
  "rules" JSONB NOT NULL,
  "change_summary" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "policy_versions_policy_id_version_key"
  ON "policy_versions" ("policy_id", "version");
CREATE INDEX "policy_versions_policy_id_created_at_idx"
  ON "policy_versions" ("policy_id", "created_at" DESC);

ALTER TABLE "policy_versions"
  ADD CONSTRAINT "policy_versions_policy_id_fkey"
  FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Human approval queue
CREATE TABLE "action_approval_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "tool" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT,
  "metadata" JSONB NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "requested_by" TEXT NOT NULL DEFAULT 'SYSTEM',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "resolution_note" TEXT,
  "consumed_at" TIMESTAMPTZ(6),
  CONSTRAINT "action_approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "action_approval_requests_workspace_id_status_requested_at_idx"
  ON "action_approval_requests" ("workspace_id", "status", "requested_at" DESC);
CREATE INDEX "action_approval_requests_agent_id_status_idx"
  ON "action_approval_requests" ("agent_id", "status");

ALTER TABLE "action_approval_requests"
  ADD CONSTRAINT "action_approval_requests_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_approval_requests"
  ADD CONSTRAINT "action_approval_requests_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SIEM/webhook integrations
CREATE TABLE "workspace_integrations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "type" "IntegrationType" NOT NULL DEFAULT 'GENERIC_WEBHOOK',
  "webhook_url" TEXT NOT NULL,
  "signing_secret" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_integrations_workspace_id_type_key"
  ON "workspace_integrations" ("workspace_id", "type");
CREATE INDEX "workspace_integrations_workspace_id_idx"
  ON "workspace_integrations" ("workspace_id");

ALTER TABLE "workspace_integrations"
  ADD CONSTRAINT "workspace_integrations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

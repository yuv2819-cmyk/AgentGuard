-- Create enums
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- Alter tables
ALTER TABLE "policies"
  ADD COLUMN "sync_source" TEXT;

-- Workspace role permission overrides
CREATE TABLE "workspace_role_permissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "role" "Role" NOT NULL,
  "permission" TEXT NOT NULL,
  "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_role_permissions_workspace_id_role_permission_key"
  ON "workspace_role_permissions" ("workspace_id", "role", "permission");
CREATE INDEX "workspace_role_permissions_workspace_id_role_idx"
  ON "workspace_role_permissions" ("workspace_id", "role");

ALTER TABLE "workspace_role_permissions"
  ADD CONSTRAINT "workspace_role_permissions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Identity providers (SSO)
CREATE TABLE "workspace_identity_providers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "domain" TEXT,
  "shared_secret" TEXT NOT NULL,
  "jit_enabled" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_identity_providers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_identity_providers_workspace_id_issuer_audience_key"
  ON "workspace_identity_providers" ("workspace_id", "issuer", "audience");
CREATE INDEX "workspace_identity_providers_workspace_id_active_idx"
  ON "workspace_identity_providers" ("workspace_id", "active");

ALTER TABLE "workspace_identity_providers"
  ADD CONSTRAINT "workspace_identity_providers_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SCIM tokens
CREATE TABLE "workspace_scim_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "description" TEXT,
  "revoked_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_scim_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_scim_tokens_token_hash_key"
  ON "workspace_scim_tokens" ("token_hash");
CREATE INDEX "workspace_scim_tokens_workspace_id_revoked_at_idx"
  ON "workspace_scim_tokens" ("workspace_id", "revoked_at");

ALTER TABLE "workspace_scim_tokens"
  ADD CONSTRAINT "workspace_scim_tokens_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_scim_tokens"
  ADD CONSTRAINT "workspace_scim_tokens_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Policy signatures (signed approvals)
CREATE TABLE "policy_approval_signatures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "signer_user_id" UUID NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_approval_signatures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "policy_approval_signatures_policy_id_version_created_at_idx"
  ON "policy_approval_signatures" ("policy_id", "version", "created_at" DESC);

ALTER TABLE "policy_approval_signatures"
  ADD CONSTRAINT "policy_approval_signatures_policy_id_fkey"
  FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_approval_signatures"
  ADD CONSTRAINT "policy_approval_signatures_signer_user_id_fkey"
  FOREIGN KEY ("signer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Policy sync config + runs (policy-as-code)
CREATE TABLE "policy_git_sync_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "repo_url" TEXT NOT NULL,
  "branch" TEXT NOT NULL DEFAULT 'main',
  "path" TEXT NOT NULL DEFAULT 'policies',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "last_synced_commit" TEXT,
  "last_synced_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_git_sync_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "policy_git_sync_configs_workspace_id_key"
  ON "policy_git_sync_configs" ("workspace_id");

ALTER TABLE "policy_git_sync_configs"
  ADD CONSTRAINT "policy_git_sync_configs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "policy_sync_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "commit_sha" TEXT,
  "imported_count" INTEGER NOT NULL DEFAULT 0,
  "summary" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "policy_sync_runs_workspace_id_created_at_idx"
  ON "policy_sync_runs" ("workspace_id", "created_at" DESC);

ALTER TABLE "policy_sync_runs"
  ADD CONSTRAINT "policy_sync_runs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_sync_runs"
  ADD CONSTRAINT "policy_sync_runs_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Runtime provider connections
CREATE TABLE "runtime_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "api_key_hash" TEXT,
  "webhook_secret" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "runtime_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "runtime_connections_workspace_id_provider_name_key"
  ON "runtime_connections" ("workspace_id", "provider", "name");
CREATE INDEX "runtime_connections_workspace_id_provider_active_idx"
  ON "runtime_connections" ("workspace_id", "provider", "active");

ALTER TABLE "runtime_connections"
  ADD CONSTRAINT "runtime_connections_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Behavioral baselines (risk v2)
CREATE TABLE "agent_action_baselines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "tool" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "avg_risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avg_per_minute" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sample_count" INTEGER NOT NULL DEFAULT 0,
  "last_seen_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_action_baselines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_action_baselines_agent_id_tool_action_key"
  ON "agent_action_baselines" ("agent_id", "tool", "action");
CREATE INDEX "agent_action_baselines_workspace_id_agent_id_idx"
  ON "agent_action_baselines" ("workspace_id", "agent_id");

ALTER TABLE "agent_action_baselines"
  ADD CONSTRAINT "agent_action_baselines_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_action_baselines"
  ADD CONSTRAINT "agent_action_baselines_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Automated response playbooks
CREATE TABLE "workspace_playbooks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "trigger_decision" "Decision",
  "min_risk_score" INTEGER NOT NULL DEFAULT 0,
  "match_signals" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "action_type" TEXT NOT NULL,
  "action_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_playbooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_playbooks_workspace_id_enabled_idx"
  ON "workspace_playbooks" ("workspace_id", "enabled");

ALTER TABLE "workspace_playbooks"
  ADD CONSTRAINT "workspace_playbooks_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "playbook_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "playbook_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "agent_id" UUID,
  "event_id" UUID,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playbook_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "playbook_executions_workspace_id_created_at_idx"
  ON "playbook_executions" ("workspace_id", "created_at" DESC);
CREATE INDEX "playbook_executions_playbook_id_created_at_idx"
  ON "playbook_executions" ("playbook_id", "created_at" DESC);

ALTER TABLE "playbook_executions"
  ADD CONSTRAINT "playbook_executions_playbook_id_fkey"
  FOREIGN KEY ("playbook_id") REFERENCES "workspace_playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playbook_executions"
  ADD CONSTRAINT "playbook_executions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playbook_executions"
  ADD CONSTRAINT "playbook_executions_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Compliance evidence packs
CREATE TABLE "compliance_evidence_packs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "framework" TEXT NOT NULL,
  "from_at" TIMESTAMPTZ(6) NOT NULL,
  "to_at" TIMESTAMPTZ(6) NOT NULL,
  "generated_by_user_id" UUID NOT NULL,
  "summary" JSONB NOT NULL,
  "sha256" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compliance_evidence_packs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_evidence_packs_workspace_id_created_at_idx"
  ON "compliance_evidence_packs" ("workspace_id", "created_at" DESC);
CREATE INDEX "compliance_evidence_packs_framework_created_at_idx"
  ON "compliance_evidence_packs" ("framework", "created_at" DESC);

ALTER TABLE "compliance_evidence_packs"
  ADD CONSTRAINT "compliance_evidence_packs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_evidence_packs"
  ADD CONSTRAINT "compliance_evidence_packs_generated_by_user_id_fkey"
  FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Public trust center attestations
CREATE TABLE "trust_attestations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "issued_by" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "public" BOOLEAN NOT NULL DEFAULT true,
  "artifact_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trust_attestations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trust_attestations_public_issued_at_idx"
  ON "trust_attestations" ("public", "issued_at" DESC);
CREATE INDEX "trust_attestations_workspace_id_issued_at_idx"
  ON "trust_attestations" ("workspace_id", "issued_at" DESC);

ALTER TABLE "trust_attestations"
  ADD CONSTRAINT "trust_attestations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

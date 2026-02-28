-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PolicyMode" AS ENUM ('STRICT', 'BALANCED');
CREATE TYPE "Decision" AS ENUM ('ALLOW', 'BLOCK');

-- CreateTable
CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "Role" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "mode" "PolicyMode" NOT NULL,
  "rules" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "environment_tag" TEXT NOT NULL,
  "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
  "active_policy_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_api_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL,
  "key_hash" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_log_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "agent_id" UUID,
  "tool" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT,
  "decision" "Decision" NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "anomaly_flagged" BOOLEAN NOT NULL DEFAULT false,
  "prev_hash" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_log_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_chain_state" (
  "workspace_id" UUID NOT NULL,
  "last_event_id" UUID,
  "last_hash" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_chain_state_pkey" PRIMARY KEY ("workspace_id")
);

-- Indexes
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members" ("workspace_id", "user_id");
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" ("user_id");
CREATE INDEX "policies_workspace_id_idx" ON "policies" ("workspace_id");
CREATE INDEX "policies_rules_idx" ON "policies" USING GIN ("rules");
CREATE INDEX "agents_workspace_id_idx" ON "agents" ("workspace_id");
CREATE UNIQUE INDEX "agent_api_keys_key_hash_key" ON "agent_api_keys" ("key_hash");
CREATE INDEX "agent_api_keys_agent_id_idx" ON "agent_api_keys" ("agent_id");
CREATE INDEX "audit_log_events_workspace_id_created_at_idx" ON "audit_log_events" ("workspace_id", "created_at" DESC);
CREATE INDEX "audit_log_events_agent_id_created_at_idx" ON "audit_log_events" ("agent_id", "created_at" DESC);
CREATE INDEX "audit_log_events_metadata_idx" ON "audit_log_events" USING GIN ("metadata");

-- Foreign Keys
ALTER TABLE "workspace_members"
ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members"
ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policies"
ADD CONSTRAINT "policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents"
ADD CONSTRAINT "agents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents"
ADD CONSTRAINT "agents_active_policy_id_fkey" FOREIGN KEY ("active_policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_api_keys"
ADD CONSTRAINT "agent_api_keys_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_log_events"
ADD CONSTRAINT "audit_log_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_log_events"
ADD CONSTRAINT "audit_log_events_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_chain_state"
ADD CONSTRAINT "audit_chain_state_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import { PrismaClient } from '@prisma/client';
import { appendAuditEvent } from '../src/lib/hashChain.js';
import { getKeyPrefix, hashAgentKey, hashPassword, hashScopedToken } from '../src/lib/crypto.js';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'admin@agentguard.demo';
const DEMO_PASSWORD = 'Admin123!ChangeMe';
const MEMBER_EMAIL = 'analyst@agentguard.demo';

const ACTIVE_KEY = 'agk_demo_active_1234567890abcdef';
const DISABLED_KEY = 'agk_demo_disabled_abcdef1234567890';
const SCIM_TOKEN = 'scim_demo_token_1234567890abcdef';
const SSO_SHARED_SECRET = 'sso_demo_shared_secret_change_me';

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
    },
    update: {
      passwordHash,
    },
  });

  const memberUser = await prisma.user.upsert({
    where: { email: MEMBER_EMAIL },
    create: {
      email: MEMBER_EMAIL,
      passwordHash,
    },
    update: {
      passwordHash,
    },
  });

  let workspace = await prisma.workspace.findFirst({
    where: { name: 'AgentGuard Demo Workspace' },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: 'AgentGuard Demo Workspace',
        timezone: 'Asia/Kolkata',
      },
    });
  }

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
    },
    update: {
      role: 'OWNER',
    },
  });

  await prisma.workspaceRolePermission.upsert({
    where: {
      workspaceId_role_permission: {
        workspaceId: workspace.id,
        role: 'MEMBER',
        permission: 'agents:rotate_keys',
      },
    },
    create: {
      workspaceId: workspace.id,
      role: 'MEMBER',
      permission: 'agents:rotate_keys',
      effect: 'ALLOW',
    },
    update: {
      effect: 'ALLOW',
    },
  });

  await prisma.workspaceIdentityProvider.upsert({
    where: {
      workspaceId_issuer_audience: {
        workspaceId: workspace.id,
        issuer: 'https://idp.agentguard.demo',
        audience: 'agentguard-demo',
      },
    },
    create: {
      workspaceId: workspace.id,
      name: 'Demo Enterprise IdP',
      issuer: 'https://idp.agentguard.demo',
      audience: 'agentguard-demo',
      domain: 'agentguard.demo',
      sharedSecret: SSO_SHARED_SECRET,
      jitEnabled: true,
      active: true,
    },
    update: {
      name: 'Demo Enterprise IdP',
      domain: 'agentguard.demo',
      sharedSecret: SSO_SHARED_SECRET,
      jitEnabled: true,
      active: true,
    },
  });

  await prisma.workspaceScimToken.upsert({
    where: {
      tokenHash: hashScopedToken('scim', SCIM_TOKEN),
    },
    create: {
      workspaceId: workspace.id,
      tokenHash: hashScopedToken('scim', SCIM_TOKEN),
      tokenPrefix: getKeyPrefix(SCIM_TOKEN),
      description: 'Demo SCIM provisioning token',
      createdByUserId: user.id,
    },
    update: {
      workspaceId: workspace.id,
      tokenPrefix: getKeyPrefix(SCIM_TOKEN),
      description: 'Demo SCIM provisioning token',
      revokedAt: null,
      createdByUserId: user.id,
    },
  });

  await prisma.policyGitSyncConfig.upsert({
    where: {
      workspaceId: workspace.id,
    },
    create: {
      workspaceId: workspace.id,
      provider: 'github',
      repoUrl: 'https://github.com/agentguard/demo-policy-repo',
      branch: 'main',
      path: 'policies',
      active: true,
      lastSyncedCommit: 'seed-demo-commit',
      lastSyncedAt: new Date(),
    },
    update: {
      provider: 'github',
      repoUrl: 'https://github.com/agentguard/demo-policy-repo',
      branch: 'main',
      path: 'policies',
      active: true,
      lastSyncedCommit: 'seed-demo-commit',
      lastSyncedAt: new Date(),
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: memberUser.id,
      },
    },
    create: {
      workspaceId: workspace.id,
      userId: memberUser.id,
      role: 'MEMBER',
    },
    update: {
      role: 'MEMBER',
    },
  });

  const readOnlyPolicy = await prisma.policy.upsert({
    where: {
      id: '7f4bb29b-9f30-4131-aeb2-95cb3776f4d1',
    },
    create: {
      id: '7f4bb29b-9f30-4131-aeb2-95cb3776f4d1',
      workspaceId: workspace.id,
      name: 'Read-only',
      description: 'Balanced read policy for demo',
      mode: 'BALANCED',
      version: 1,
      status: 'APPROVED',
      approvedByUserId: user.id,
      approvedAt: new Date(),
      rules: {
        mode: 'BALANCED',
        allow_actions: ['read', 'list', 'search'],
        deny_actions: ['delete', 'drop', 'write_prod'],
        allow_tools: ['knowledge_base', 'crm', 'slack'],
        deny_tools: ['prod_db_shell'],
        require_approval_actions: ['delete'],
      },
    },
    update: {
      workspaceId: workspace.id,
      name: 'Read-only',
      description: 'Balanced read policy for demo',
      mode: 'BALANCED',
      version: 1,
      status: 'APPROVED',
      approvedByUserId: user.id,
      approvedAt: new Date(),
      rules: {
        mode: 'BALANCED',
        allow_actions: ['read', 'list', 'search'],
        deny_actions: ['delete', 'drop', 'write_prod'],
        allow_tools: ['knowledge_base', 'crm', 'slack'],
        deny_tools: ['prod_db_shell'],
        require_approval_actions: ['delete'],
      },
    },
  });

  const strictPolicy = await prisma.policy.upsert({
    where: {
      id: '0186cd27-f486-4746-8540-ceab58db4afe',
    },
    create: {
      id: '0186cd27-f486-4746-8540-ceab58db4afe',
      workspaceId: workspace.id,
      name: 'Strict',
      description: 'Strict allowlist policy for demo',
      mode: 'STRICT',
      version: 1,
      status: 'APPROVED',
      approvedByUserId: user.id,
      approvedAt: new Date(),
      rules: {
        mode: 'STRICT',
        allow_actions: ['read', 'list'],
        deny_actions: ['delete', 'drop', 'transfer_funds', 'admin_override'],
        allow_tools: ['knowledge_base'],
        deny_tools: ['*'],
        require_approval_actions: ['transfer_funds', 'admin_override'],
      },
    },
    update: {
      workspaceId: workspace.id,
      name: 'Strict',
      description: 'Strict allowlist policy for demo',
      mode: 'STRICT',
      version: 1,
      status: 'APPROVED',
      approvedByUserId: user.id,
      approvedAt: new Date(),
      rules: {
        mode: 'STRICT',
        allow_actions: ['read', 'list'],
        deny_actions: ['delete', 'drop', 'transfer_funds', 'admin_override'],
        allow_tools: ['knowledge_base'],
        deny_tools: ['*'],
        require_approval_actions: ['transfer_funds', 'admin_override'],
      },
    },
  });

  await prisma.policyVersion.upsert({
    where: {
      policyId_version: {
        policyId: readOnlyPolicy.id,
        version: 1,
      },
    },
    create: {
      policyId: readOnlyPolicy.id,
      version: 1,
      mode: readOnlyPolicy.mode,
      rules: readOnlyPolicy.rules as any,
      changeSummary: 'Initial approved baseline',
      createdByUserId: user.id,
    },
    update: {
      mode: readOnlyPolicy.mode,
      rules: readOnlyPolicy.rules as any,
      changeSummary: 'Initial approved baseline',
      createdByUserId: user.id,
    },
  });

  await prisma.policyVersion.upsert({
    where: {
      policyId_version: {
        policyId: strictPolicy.id,
        version: 1,
      },
    },
    create: {
      policyId: strictPolicy.id,
      version: 1,
      mode: strictPolicy.mode,
      rules: strictPolicy.rules as any,
      changeSummary: 'Initial approved baseline',
      createdByUserId: user.id,
    },
    update: {
      mode: strictPolicy.mode,
      rules: strictPolicy.rules as any,
      changeSummary: 'Initial approved baseline',
      createdByUserId: user.id,
    },
  });

  const activeAgent = await prisma.agent.upsert({
    where: {
      id: 'f398cb72-1f4a-49e6-9cf9-803ecb6bd503',
    },
    create: {
      id: 'f398cb72-1f4a-49e6-9cf9-803ecb6bd503',
      workspaceId: workspace.id,
      name: 'Support Copilot',
      description: 'Handles support lookups with guardrails',
      environmentTag: 'production',
      status: 'ACTIVE',
      activePolicyId: readOnlyPolicy.id,
    },
    update: {
      workspaceId: workspace.id,
      name: 'Support Copilot',
      description: 'Handles support lookups with guardrails',
      environmentTag: 'production',
      status: 'ACTIVE',
      activePolicyId: readOnlyPolicy.id,
    },
  });

  const disabledAgent = await prisma.agent.upsert({
    where: {
      id: '08c04779-8607-4602-9ce3-9ede663e6afe',
    },
    create: {
      id: '08c04779-8607-4602-9ce3-9ede663e6afe',
      workspaceId: workspace.id,
      name: 'Finance Executor',
      description: 'High-privilege automation agent (disabled)',
      environmentTag: 'staging',
      status: 'DISABLED',
      activePolicyId: strictPolicy.id,
    },
    update: {
      workspaceId: workspace.id,
      name: 'Finance Executor',
      description: 'High-privilege automation agent (disabled)',
      environmentTag: 'staging',
      status: 'DISABLED',
      activePolicyId: strictPolicy.id,
    },
  });

  await prisma.agentApiKey.upsert({
    where: {
      keyHash: hashAgentKey(ACTIVE_KEY),
    },
    create: {
      agentId: activeAgent.id,
      keyHash: hashAgentKey(ACTIVE_KEY),
      keyPrefix: getKeyPrefix(ACTIVE_KEY),
    },
    update: {
      agentId: activeAgent.id,
      keyPrefix: getKeyPrefix(ACTIVE_KEY),
      revokedAt: null,
    },
  });

  await prisma.runtimeConnection.upsert({
    where: {
      workspaceId_provider_name: {
        workspaceId: workspace.id,
        provider: 'OPENAI',
        name: 'Primary OpenAI Prod',
      },
    },
    create: {
      workspaceId: workspace.id,
      provider: 'OPENAI',
      name: 'Primary OpenAI Prod',
      active: true,
      apiKeyHash: hashScopedToken('runtime_api_key', 'openai_demo_api_key'),
      webhookSecret: 'runtime-openai-secret',
    },
    update: {
      active: true,
      apiKeyHash: hashScopedToken('runtime_api_key', 'openai_demo_api_key'),
      webhookSecret: 'runtime-openai-secret',
    },
  });

  await prisma.workspacePlaybook.upsert({
    where: {
      id: 'fcb72e30-39b5-4fdb-b106-b6dcb30afba2',
    },
    create: {
      id: 'fcb72e30-39b5-4fdb-b106-b6dcb30afba2',
      workspaceId: workspace.id,
      name: 'Auto disable critical blocked actions',
      description: 'If a high-risk action is blocked at high score, disable the agent immediately.',
      enabled: true,
      triggerDecision: 'BLOCK',
      minRiskScore: 80,
      matchSignals: ['high_risk_action'],
      actionType: 'DISABLE_AGENT',
      actionConfig: {},
    },
    update: {
      workspaceId: workspace.id,
      name: 'Auto disable critical blocked actions',
      description: 'If a high-risk action is blocked at high score, disable the agent immediately.',
      enabled: true,
      triggerDecision: 'BLOCK',
      minRiskScore: 80,
      matchSignals: ['high_risk_action'],
      actionType: 'DISABLE_AGENT',
      actionConfig: {},
    },
  });

  await prisma.trustAttestation.upsert({
    where: {
      id: '0a3ac250-b7ab-4e7d-b06f-57b1bb12cf6d',
    },
    create: {
      id: '0a3ac250-b7ab-4e7d-b06f-57b1bb12cf6d',
      workspaceId: workspace.id,
      title: 'SOC 2 Type II Readiness Program',
      description: 'Independent control readiness review completed for core AgentGuard services.',
      status: 'ACTIVE',
      issuedBy: 'Aegis Assurance LLP',
      issuedAt: new Date(),
      isPublic: true,
      artifactUrl: 'https://agentguard.demo/trust/soc2-readiness.pdf',
    },
    update: {
      workspaceId: workspace.id,
      title: 'SOC 2 Type II Readiness Program',
      description: 'Independent control readiness review completed for core AgentGuard services.',
      status: 'ACTIVE',
      issuedBy: 'Aegis Assurance LLP',
      issuedAt: new Date(),
      isPublic: true,
      artifactUrl: 'https://agentguard.demo/trust/soc2-readiness.pdf',
    },
  });

  await prisma.agentApiKey.upsert({
    where: {
      keyHash: hashAgentKey(DISABLED_KEY),
    },
    create: {
      agentId: disabledAgent.id,
      keyHash: hashAgentKey(DISABLED_KEY),
      keyPrefix: getKeyPrefix(DISABLED_KEY),
      revokedAt: null,
    },
    update: {
      agentId: disabledAgent.id,
      keyPrefix: getKeyPrefix(DISABLED_KEY),
      revokedAt: null,
    },
  });

  const existingEventCount = await prisma.auditLogEvent.count({
    where: {
      workspaceId: workspace.id,
    },
  });

  if (existingEventCount < 3) {
    await appendAuditEvent(prisma, {
      workspaceId: workspace.id,
      agentId: activeAgent.id,
      tool: 'knowledge_base',
      action: 'read',
      resource: 'ticket:8921',
      decision: 'ALLOW',
      reason: 'allowed_by_policy_engine',
      metadata: { source: 'seed' },
      anomalyFlagged: false,
    });

    await appendAuditEvent(prisma, {
      workspaceId: workspace.id,
      agentId: activeAgent.id,
      tool: 'prod_db_shell',
      action: 'read',
      resource: 'table:customers',
      decision: 'BLOCK',
      reason: 'tool_denied_by_policy',
      metadata: { source: 'seed', signal: 'unknown_tool' },
      anomalyFlagged: true,
    });

    await appendAuditEvent(prisma, {
      workspaceId: workspace.id,
      agentId: disabledAgent.id,
      tool: 'payments',
      action: 'transfer_funds',
      resource: 'wallet:treasury',
      decision: 'BLOCK',
      reason: 'agent_disabled',
      metadata: { source: 'seed', signal: 'high_risk_action' },
      anomalyFlagged: true,
    });
  }

  console.log('Seed complete');
  console.log('Demo user:', DEMO_EMAIL);
  console.log('Demo member:', MEMBER_EMAIL);
  console.log('Demo password:', DEMO_PASSWORD);
  console.log('Active demo agent key:', ACTIVE_KEY);
  console.log('Demo SCIM token:', SCIM_TOKEN);
  console.log('Demo SSO shared secret:', SSO_SHARED_SECRET);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

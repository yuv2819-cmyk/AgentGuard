import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashAgentKey, hashScopedToken } from '../lib/crypto.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';
import { evaluateAndLogAction } from '../services/actionService.js';

const router = Router();

const runtimeConnectionSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  provider: z.enum(['OPENAI', 'ANTHROPIC', 'LANGCHAIN', 'CREWAI']),
  name: z.string().min(2).max(80),
  apiKey: z.string().min(8).max(512).optional().nullable(),
  webhookSecret: z.string().min(8).max(512).optional().nullable(),
  active: z.boolean().optional(),
});

const runtimeConnectionPatchSchema = runtimeConnectionSchema.partial().omit({
  workspaceId: true,
});

const runtimeActionSchema = z.object({
  connectionName: z.string().min(2).max(80).optional(),
  tool: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().max(255).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  approvalRequestId: z.string().uuid().optional(),
});

router.get('/runtime/connections', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'runtime:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const connections = await prisma.runtimeConnection.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return res.json({
    connections: connections.map((item) => ({
      id: item.id,
      provider: item.provider,
      name: item.name,
      active: item.active,
      hasApiKey: Boolean(item.apiKeyHash),
      hasWebhookSecret: Boolean(item.webhookSecret),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  });
});

router.post('/runtime/connections', requireUserAuth, async (req, res) => {
  const parsed = runtimeConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'runtime:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const connection = await prisma.runtimeConnection.create({
    data: {
      workspaceId,
      provider: parsed.data.provider,
      name: parsed.data.name,
      apiKeyHash: parsed.data.apiKey ? hashScopedToken('runtime_api_key', parsed.data.apiKey) : null,
      webhookSecret: parsed.data.webhookSecret ?? null,
      active: parsed.data.active ?? true,
    },
  });

  return res.status(201).json({
    connection: {
      id: connection.id,
      provider: connection.provider,
      name: connection.name,
      active: connection.active,
      hasApiKey: Boolean(connection.apiKeyHash),
      hasWebhookSecret: Boolean(connection.webhookSecret),
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    },
  });
});

router.patch('/runtime/connections/:id', requireUserAuth, async (req, res) => {
  const connectionId = String(req.params.id);
  const parsed = runtimeConnectionPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.runtimeConnection.findUnique({
    where: {
      id: connectionId,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Runtime connection not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'runtime:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const connection = await prisma.runtimeConnection.update({
    where: {
      id: existing.id,
    },
    data: {
      provider: parsed.data.provider,
      name: parsed.data.name,
      apiKeyHash: parsed.data.apiKey
        ? hashScopedToken('runtime_api_key', parsed.data.apiKey)
        : parsed.data.apiKey === null
          ? null
          : undefined,
      webhookSecret:
        parsed.data.webhookSecret === undefined ? undefined : (parsed.data.webhookSecret ?? null),
      active: parsed.data.active,
    },
  });

  return res.json({
    connection: {
      id: connection.id,
      provider: connection.provider,
      name: connection.name,
      active: connection.active,
      hasApiKey: Boolean(connection.apiKeyHash),
      hasWebhookSecret: Boolean(connection.webhookSecret),
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    },
  });
});

router.delete('/runtime/connections/:id', requireUserAuth, async (req, res) => {
  const connectionId = String(req.params.id);
  const existing = await prisma.runtimeConnection.findUnique({
    where: {
      id: connectionId,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Runtime connection not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'runtime:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  await prisma.runtimeConnection.delete({
    where: {
      id: existing.id,
    },
  });

  return res.status(204).send();
});

router.post('/runtime/:provider/actions', async (req, res) => {
  const parsed = runtimeActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const provider = String(req.params.provider).toUpperCase();
  if (!['OPENAI', 'ANTHROPIC', 'LANGCHAIN', 'CREWAI'].includes(provider)) {
    return res.status(400).json({ error: 'Unsupported runtime provider' });
  }

  const rawKey = req.header('x-agent-key');
  if (!rawKey) {
    return res.status(401).json({ error: 'Missing X-Agent-Key header' });
  }

  const keyHash = hashAgentKey(rawKey);
  const apiKeyRecord = await prisma.agentApiKey.findUnique({
    where: {
      keyHash,
    },
    include: {
      agent: {
        select: {
          id: true,
          status: true,
          workspaceId: true,
          activePolicyId: true,
        },
      },
    },
  });

  if (!apiKeyRecord) {
    return res.status(401).json({ error: 'Invalid agent key' });
  }

  await prisma.agentApiKey.update({
    where: {
      id: apiKeyRecord.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  const connection = await prisma.runtimeConnection.findFirst({
    where: {
      workspaceId: apiKeyRecord.agent.workspaceId,
      provider,
      name: parsed.data.connectionName ?? undefined,
      active: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  let forceBlockReason: string | undefined = undefined;

  if (apiKeyRecord.revokedAt) {
    forceBlockReason = 'key_revoked';
  } else if (!connection) {
    forceBlockReason = 'runtime_unregistered';
  } else if (connection.webhookSecret) {
    const runtimeSecret = req.header('x-runtime-secret');
    if (!runtimeSecret || runtimeSecret !== connection.webhookSecret) {
      forceBlockReason = 'runtime_signature_invalid';
    }
  }

  const result = await evaluateAndLogAction({
    prisma,
    workspaceId: apiKeyRecord.agent.workspaceId,
    agent: {
      id: apiKeyRecord.agent.id,
      status: apiKeyRecord.agent.status,
      activePolicyId: apiKeyRecord.agent.activePolicyId,
    },
    tool: parsed.data.tool,
    action: parsed.data.action,
    resource: parsed.data.resource ?? null,
    metadata: {
      ...(parsed.data.metadata ?? {}),
      runtime_provider: provider,
      runtime_connection: connection?.name ?? null,
    },
    forceBlockReason,
    approvalRequestId: parsed.data.approvalRequestId,
    requestedBy: `RUNTIME:${provider}`,
  });

  const statusCode = result.decision === 'BLOCK' ? 403 : 200;
  return res.status(statusCode).json({
    decision: result.decision,
    reason: result.reason,
    signals: result.signals,
    riskScore: result.riskScore,
    approvalRequestId: result.approvalRequestId,
    eventId: result.event.id,
    createdAt: result.event.createdAt,
  });
});

export default router;

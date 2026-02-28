import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getKeyPrefix, generateRawAgentKey, hashAgentKey } from '../lib/crypto.js';
import { assertWorkspaceMember, assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const createAgentSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).nullable().optional(),
  environmentTag: z.string().min(2).max(50),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
});

const patchAgentSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  environmentTag: z.string().min(2).max(50).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const assignPolicySchema = z.object({
  policyId: z.string().uuid().nullable(),
});

const getAgentWithMembership = async (agentId: string, userId: string) => {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      activePolicy: true,
      apiKeys: {
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!agent) {
    return { agent: null, membership: null };
  }

  const membership = await assertWorkspaceMember(userId, agent.workspaceId);
  return { agent, membership };
};

router.get('/agents', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required via X-Workspace-Id header or query' });
  }

  const membership = await assertWorkspaceMember(req.user!.id, workspaceId);
  if (!membership) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  const permission = await assertWorkspacePermission(req.user!.id, workspaceId, 'agents:read');
  if (!permission || !permission.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const agents = await prisma.agent.findMany({
    where: { workspaceId },
    include: {
      activePolicy: {
        select: { id: true, name: true, mode: true },
      },
      apiKeys: {
        select: {
          id: true,
          keyPrefix: true,
          revokedAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return res.json({ agents });
});

router.post('/agents', requireUserAuth, async (req, res) => {
  const parsed = createAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'agents:write');
  if (!access) return res.status(403).json({ error: 'Workspace access denied' });
  if (!access.authorized) return res.status(403).json({ error: 'Insufficient role permissions' });

  const rawKey = generateRawAgentKey();
  const keyHash = hashAgentKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);

  try {
    const created = await prisma.$transaction(async (tx: any) => {
      const agent = await tx.agent.create({
        data: {
          workspaceId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          environmentTag: parsed.data.environmentTag,
          status: parsed.data.status,
        },
      });

      await tx.agentApiKey.create({
        data: {
          agentId: agent.id,
          keyHash,
          keyPrefix,
        },
      });

      return agent;
    });

    return res.status(201).json({
      agent: created,
      apiKey: rawKey,
      keyPrefix,
      note: 'Store this API key now. It will not be shown again.',
    });
  } catch {
    return res.status(500).json({ error: 'Unable to create agent' });
  }
});

router.get('/agents/:id', requireUserAuth, async (req, res) => {
  const agentId = String(req.params.id);
  const { agent, membership } = await getAgentWithMembership(agentId, req.user!.id);

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  if (!membership) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  const access = await assertWorkspacePermission(req.user!.id, agent.workspaceId, 'agents:read');
  if (!access || !access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  return res.json({
    agent: {
      ...agent,
      apiKeys: agent.apiKeys.map((key: any) => ({
        id: key.id,
        keyPrefix: key.keyPrefix,
        revokedAt: key.revokedAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      })),
    },
  });
});

router.patch('/agents/:id', requireUserAuth, async (req, res) => {
  const agentId = String(req.params.id);
  const parsed = patchAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!existing) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'agents:write');
  if (!access) return res.status(403).json({ error: 'Workspace access denied' });
  if (!access.authorized) return res.status(403).json({ error: 'Insufficient role permissions' });

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: {
      ...parsed.data,
      description:
        parsed.data.description === undefined ? undefined : (parsed.data.description ?? null),
    },
  });

  return res.json({ agent });
});

router.post('/agents/:id/disable', requireUserAuth, async (req, res) => {
  const agentId = String(req.params.id);
  const existing = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!existing) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const access = await assertWorkspacePermission(
    req.user!.id,
    existing.workspaceId,
    'agents:kill_switch',
  );
  if (!access) return res.status(403).json({ error: 'Workspace access denied' });
  if (!access.authorized) return res.status(403).json({ error: 'Insufficient role permissions' });

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: { status: 'DISABLED' },
  });

  return res.json({ agent });
});

router.post('/agents/:id/keys/rotate', requireUserAuth, async (req, res) => {
  const agentId = String(req.params.id);
  const existing = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!existing) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const access = await assertWorkspacePermission(
    req.user!.id,
    existing.workspaceId,
    'agents:rotate_keys',
  );
  if (!access) return res.status(403).json({ error: 'Workspace access denied' });
  if (!access.authorized) return res.status(403).json({ error: 'Insufficient role permissions' });

  const rawKey = generateRawAgentKey();
  const keyHash = hashAgentKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);

  await prisma.$transaction(async (tx: any) => {
    await tx.agentApiKey.updateMany({
      where: {
        agentId: existing.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await tx.agentApiKey.create({
      data: {
        agentId: existing.id,
        keyHash,
        keyPrefix,
      },
    });
  });

  return res.json({
    apiKey: rawKey,
    keyPrefix,
    note: 'Store this rotated API key now. It will not be shown again.',
  });
});

router.post('/agents/:id/assign-policy', requireUserAuth, async (req, res) => {
  const agentId = String(req.params.id);
  const parsed = assignPolicySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, agent.workspaceId, 'agents:write');
  if (!access) return res.status(403).json({ error: 'Workspace access denied' });
  if (!access.authorized) return res.status(403).json({ error: 'Insufficient role permissions' });

  if (parsed.data.policyId) {
    const policy = await prisma.policy.findFirst({
      where: {
        id: parsed.data.policyId,
        workspaceId: agent.workspaceId,
        status: 'APPROVED',
      },
    });

    if (!policy) {
      return res.status(404).json({ error: 'Policy not found or not approved in workspace' });
    }
  }

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: {
      activePolicyId: parsed.data.policyId,
    },
  });

  return res.json({ agent: updated });
});

export default router;

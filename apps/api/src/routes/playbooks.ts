import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const actionTypeSchema = z.enum([
  'DISABLE_AGENT',
  'REVOKE_ACTIVE_KEYS',
  'CREATE_APPROVAL',
  'NOTIFY_WEBHOOK',
]);

const playbookBodySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  triggerDecision: z.enum(['ALLOW', 'BLOCK']).optional().nullable(),
  minRiskScore: z.coerce.number().int().min(0).max(100).optional(),
  matchSignals: z.array(z.string()).max(50).optional(),
  actionType: actionTypeSchema,
  actionConfig: z.record(z.unknown()).optional(),
});

const playbookPatchSchema = playbookBodySchema.partial().omit({ workspaceId: true });

router.get('/playbooks', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'playbooks:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const playbooks = await prisma.workspacePlaybook.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return res.json({ playbooks });
});

router.post('/playbooks', requireUserAuth, async (req, res) => {
  const parsed = playbookBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'playbooks:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const playbook = await prisma.workspacePlaybook.create({
    data: {
      workspaceId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      enabled: parsed.data.enabled ?? true,
      triggerDecision: parsed.data.triggerDecision ?? null,
      minRiskScore: parsed.data.minRiskScore ?? 0,
      matchSignals: (parsed.data.matchSignals ?? []) as any,
      actionType: parsed.data.actionType,
      actionConfig: (parsed.data.actionConfig ?? {}) as any,
    },
  });

  return res.status(201).json({ playbook });
});

router.patch('/playbooks/:id', requireUserAuth, async (req, res) => {
  const playbookId = String(req.params.id);
  const parsed = playbookPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.workspacePlaybook.findUnique({
    where: {
      id: playbookId,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Playbook not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'playbooks:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const playbook = await prisma.workspacePlaybook.update({
    where: {
      id: existing.id,
    },
    data: {
      name: parsed.data.name,
      description:
        parsed.data.description === undefined ? undefined : (parsed.data.description ?? null),
      enabled: parsed.data.enabled,
      triggerDecision:
        parsed.data.triggerDecision === undefined ? undefined : (parsed.data.triggerDecision ?? null),
      minRiskScore: parsed.data.minRiskScore,
      matchSignals: parsed.data.matchSignals ? (parsed.data.matchSignals as any) : undefined,
      actionType: parsed.data.actionType,
      actionConfig: parsed.data.actionConfig ? (parsed.data.actionConfig as any) : undefined,
    },
  });

  return res.json({ playbook });
});

router.delete('/playbooks/:id', requireUserAuth, async (req, res) => {
  const playbookId = String(req.params.id);
  const existing = await prisma.workspacePlaybook.findUnique({
    where: {
      id: playbookId,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Playbook not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'playbooks:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  await prisma.workspacePlaybook.delete({
    where: {
      id: existing.id,
    },
  });

  return res.status(204).send();
});

router.get('/playbooks/executions', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'playbooks:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const executions = await prisma.playbookExecution.findMany({
    where: {
      workspaceId,
    },
    include: {
      playbook: {
        select: {
          id: true,
          name: true,
          actionType: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 200,
  });

  return res.json({ executions });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const webhookSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  webhookUrl: z.string().url(),
  signingSecret: z.string().min(6).optional().nullable(),
  active: z.boolean().optional(),
});

router.get('/integrations', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'audit:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const integrations = await prisma.workspaceIntegration.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return res.json({ integrations });
});

router.post('/integrations/webhook', requireUserAuth, async (req, res) => {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'integrations:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const integration = await prisma.workspaceIntegration.upsert({
    where: {
      workspaceId_type: {
        workspaceId,
        type: 'GENERIC_WEBHOOK',
      },
    },
    create: {
      workspaceId,
      type: 'GENERIC_WEBHOOK',
      webhookUrl: parsed.data.webhookUrl,
      signingSecret: parsed.data.signingSecret ?? null,
      active: parsed.data.active ?? true,
    },
    update: {
      webhookUrl: parsed.data.webhookUrl,
      signingSecret: parsed.data.signingSecret ?? null,
      active: parsed.data.active ?? true,
    },
  });

  return res.status(201).json({ integration });
});

router.delete('/integrations/:id', requireUserAuth, async (req, res) => {
  const integrationId = String(req.params.id);
  const integration = await prisma.workspaceIntegration.findUnique({
    where: {
      id: integrationId,
    },
  });

  if (!integration) {
    return res.status(404).json({ error: 'Integration not found' });
  }

  const access = await assertWorkspacePermission(
    req.user!.id,
    integration.workspaceId,
    'integrations:manage',
  );

  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  await prisma.workspaceIntegration.delete({
    where: {
      id: integration.id,
    },
  });

  return res.status(204).send();
});

export default router;

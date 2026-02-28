import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';
import { evaluateAndLogAction } from '../services/actionService.js';

const router = Router();

const simulateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  agentId: z.string().uuid(),
  tool: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().max(255).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  approvalRequestId: z.string().uuid().optional(),
});

router.post('/simulate', requireUserAuth, async (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const { agentId, tool, action, resource, metadata, approvalRequestId } = parsed.data;

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'simulate:run');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      workspaceId,
    },
    select: {
      id: true,
      status: true,
      activePolicyId: true,
    },
  });

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found in workspace' });
  }

  const result = await evaluateAndLogAction({
    prisma,
    workspaceId,
    agent,
    tool,
    action,
    resource: resource ?? null,
    metadata,
    approvalRequestId,
    requestedBy: req.user!.email,
  });

  return res.json({
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

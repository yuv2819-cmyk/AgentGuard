import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const listSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']).optional(),
  agentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const resolutionSchema = z.object({
  note: z.string().max(500).optional(),
});

router.get('/approvals', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const parsed = listSchema.safeParse({
    ...req.query,
    workspaceId,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'approvals:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const where: Record<string, any> = { workspaceId };
  if (parsed.data.status) {
    where.status = parsed.data.status;
  }

  if (parsed.data.agentId) {
    where.agentId = parsed.data.agentId;
  }

  const skip = (parsed.data.page - 1) * parsed.data.pageSize;

  const [total, approvals] = await Promise.all([
    prisma.actionApprovalRequest.count({ where }),
    prisma.actionApprovalRequest.findMany({
      where,
      orderBy: {
        requestedAt: 'desc',
      },
      skip,
      take: parsed.data.pageSize,
    }),
  ]);

  return res.json({
    data: approvals,
    pagination: {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total,
      totalPages: Math.ceil(total / parsed.data.pageSize),
    },
  });
});

router.post('/approvals/:id/approve', requireUserAuth, async (req, res) => {
  const approvalId = String(req.params.id);
  const parsed = resolutionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const approval = await prisma.actionApprovalRequest.findUnique({
    where: { id: approvalId },
  });

  if (!approval) {
    return res.status(404).json({ error: 'Approval request not found' });
  }

  const access = await assertWorkspacePermission(
    req.user!.id,
    approval.workspaceId,
    'approvals:manage',
  );

  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  if (approval.status !== 'PENDING') {
    return res.status(400).json({ error: 'Approval request is no longer pending' });
  }

  const updated = await prisma.actionApprovalRequest.update({
    where: { id: approval.id },
    data: {
      status: 'APPROVED',
      resolvedByUserId: req.user!.id,
      resolvedAt: new Date(),
      resolutionNote: parsed.data.note ?? null,
    },
  });

  return res.json({ approval: updated });
});

router.post('/approvals/:id/reject', requireUserAuth, async (req, res) => {
  const approvalId = String(req.params.id);
  const parsed = resolutionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const approval = await prisma.actionApprovalRequest.findUnique({
    where: { id: approvalId },
  });

  if (!approval) {
    return res.status(404).json({ error: 'Approval request not found' });
  }

  const access = await assertWorkspacePermission(
    req.user!.id,
    approval.workspaceId,
    'approvals:manage',
  );

  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  if (approval.status !== 'PENDING') {
    return res.status(400).json({ error: 'Approval request is no longer pending' });
  }

  const updated = await prisma.actionApprovalRequest.update({
    where: { id: approval.id },
    data: {
      status: 'REJECTED',
      resolvedByUserId: req.user!.id,
      resolvedAt: new Date(),
      resolutionNote: parsed.data.note ?? null,
    },
  });

  return res.json({ approval: updated });
});

export default router;

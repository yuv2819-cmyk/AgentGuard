import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { signApprovalPayload } from '../lib/crypto.js';
import { normalizePolicyRules } from '../lib/policyEngine.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const policyRulesSchema = z.object({
  mode: z.enum(['STRICT', 'BALANCED']).optional(),
  allow_actions: z.array(z.string()).optional(),
  deny_actions: z.array(z.string()).optional(),
  allow_tools: z.array(z.string()).optional(),
  deny_tools: z.array(z.string()).optional(),
  require_approval_actions: z.array(z.string()).optional(),
});

const policyBodySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  mode: z.enum(['STRICT', 'BALANCED']).optional(),
  rules: policyRulesSchema.optional(),
});

const patchPolicySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  mode: z.enum(['STRICT', 'BALANCED']).optional(),
  rules: policyRulesSchema.optional(),
  changeSummary: z.string().max(255).optional(),
});

const rejectionSchema = z.object({
  reason: z.string().min(3).max(500),
});

const approveSchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

router.get('/policies', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'policies:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const policies = await prisma.policy.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return res.json({ policies });
});

router.post('/policies', requireUserAuth, async (req, res) => {
  const parsed = policyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'policies:write');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const normalizedRules = normalizePolicyRules(parsed.data.rules ?? {}, parsed.data.mode);

  const policy = await prisma.$transaction(async (tx: any) => {
    const created = await tx.policy.create({
      data: {
        workspaceId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        mode: parsed.data.mode ?? normalizedRules.mode,
        rules: normalizedRules as any,
        version: 1,
        status: 'DRAFT',
      },
    });

    await tx.policyVersion.create({
      data: {
        policyId: created.id,
        version: 1,
        mode: created.mode,
        rules: created.rules as any,
        changeSummary: 'Initial policy draft',
        createdByUserId: req.user!.id,
      },
    });

    return created;
  });

  return res.status(201).json({ policy });
});

router.get('/policies/:id', requireUserAuth, async (req, res) => {
  const policyId = String(req.params.id);
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, policy.workspaceId, 'policies:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  return res.json({ policy });
});

router.patch('/policies/:id', requireUserAuth, async (req, res) => {
  const policyId = String(req.params.id);
  const parsed = patchPolicySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!existing) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'policies:write');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const mergedMode = parsed.data.mode ?? existing.mode;
  const mergedRules = normalizePolicyRules(
    {
      ...(existing.rules as Record<string, unknown>),
      ...(parsed.data.rules ?? {}),
    },
    mergedMode,
  );

  const nextVersion = existing.version + 1;

  const policy = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.policy.update({
      where: { id: policyId },
      data: {
        name: parsed.data.name,
        description:
          parsed.data.description === undefined ? undefined : (parsed.data.description ?? null),
        mode: mergedMode,
        rules: mergedRules as any,
        version: nextVersion,
        status: 'DRAFT',
        submittedByUserId: null,
        submittedAt: null,
        approvedByUserId: null,
        approvedAt: null,
        rejectionReason: null,
      },
    });

    await tx.policyVersion.create({
      data: {
        policyId: updated.id,
        version: updated.version,
        mode: updated.mode,
        rules: updated.rules as any,
        changeSummary: parsed.data.changeSummary ?? 'Policy updated',
        createdByUserId: req.user!.id,
      },
    });

    return updated;
  });

  return res.json({ policy });
});

router.get('/policies/:id/versions', requireUserAuth, async (req, res) => {
  const policyId = String(req.params.id);
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, policy.workspaceId, 'policies:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const versions = await prisma.policyVersion.findMany({
    where: {
      policyId,
    },
    orderBy: {
      version: 'desc',
    },
  });

  return res.json({ versions });
});

router.post('/policies/:id/submit-approval', requireUserAuth, async (req, res) => {
  const policyId = String(req.params.id);
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, policy.workspaceId, 'policies:write');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  if (!['DRAFT', 'REJECTED'].includes(policy.status)) {
    return res.status(400).json({ error: 'Only draft or rejected policies can be submitted' });
  }

  const updated = await prisma.policy.update({
    where: { id: policy.id },
    data: {
      status: 'PENDING_APPROVAL',
      submittedByUserId: req.user!.id,
      submittedAt: new Date(),
      rejectionReason: null,
    },
  });

  return res.json({ policy: updated });
});

router.post('/policies/:id/approve', requireUserAuth, async (req, res) => {
  const policyId = String(req.params.id);
  const parsed = approveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, policy.workspaceId, 'policies:approve');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  if (policy.status !== 'PENDING_APPROVAL') {
    return res.status(400).json({ error: 'Policy must be pending approval' });
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const approvedAt = new Date();

    const updatedPolicy = await tx.policy.update({
      where: { id: policy.id },
      data: {
        status: 'APPROVED',
        approvedByUserId: req.user!.id,
        approvedAt,
        rejectionReason: null,
      },
    });

    const signaturePayload = JSON.stringify({
      policyId: updatedPolicy.id,
      workspaceId: updatedPolicy.workspaceId,
      version: updatedPolicy.version,
      mode: updatedPolicy.mode,
      rules: updatedPolicy.rules,
      approvedByUserId: req.user!.id,
      approvedAt: approvedAt.toISOString(),
    });

    const payloadHash = createHash('sha256').update(signaturePayload).digest('hex');
    const signature = signApprovalPayload(signaturePayload);

    await tx.policyApprovalSignature.create({
      data: {
        policyId: updatedPolicy.id,
        version: updatedPolicy.version,
        signerUserId: req.user!.id,
        payloadHash,
        signature,
        note: parsed.data.note ?? null,
      },
    });

    return updatedPolicy;
  });

  return res.json({ policy: updated, signedApproval: true });
});

router.post('/policies/:id/reject', requireUserAuth, async (req, res) => {
  const policyId = String(req.params.id);
  const parsed = rejectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, policy.workspaceId, 'policies:approve');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  if (policy.status !== 'PENDING_APPROVAL') {
    return res.status(400).json({ error: 'Policy must be pending approval' });
  }

  const updated = await prisma.policy.update({
    where: { id: policy.id },
    data: {
      status: 'REJECTED',
      approvedByUserId: null,
      approvedAt: null,
      rejectionReason: parsed.data.reason,
    },
  });

  return res.json({ policy: updated });
});

router.get('/policies/:id/signatures', requireUserAuth, async (req, res) => {
  const policyId = String(req.params.id);
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, policy.workspaceId, 'policies:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const signatures = await prisma.policyApprovalSignature.findMany({
    where: {
      policyId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      signer: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  return res.json({ signatures });
});

export default router;

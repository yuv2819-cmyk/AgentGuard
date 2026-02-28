import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const attestationSchema = z.object({
  workspaceId: z.string().uuid().optional().nullable(),
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(1000),
  status: z.string().min(2).max(40).optional(),
  issuedBy: z.string().min(2).max(120),
  issuedAt: z.string().datetime().optional(),
  isPublic: z.boolean().optional(),
  artifactUrl: z.string().url().optional().nullable(),
});

const attestationPatchSchema = attestationSchema.partial().omit({ workspaceId: true });

router.get('/public/trust-center', async (_req, res) => {
  const [attestations, aggregate] = await Promise.all([
    prisma.trustAttestation.findMany({
      where: {
        isPublic: true,
      },
      orderBy: {
        issuedAt: 'desc',
      },
      take: 100,
    }),
    prisma.auditLogEvent.groupBy({
      by: ['decision'],
      _count: {
        _all: true,
      },
    }),
  ]);

  return res.json({
    updatedAt: new Date().toISOString(),
    attestations,
    decisionSummary: aggregate.map((item) => ({
      decision: item.decision,
      count: item._count._all,
    })),
  });
});

router.get('/trust-attestations', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'compliance:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const attestations = await prisma.trustAttestation.findMany({
    where: {
      OR: [{ workspaceId }, { workspaceId: null }],
    },
    orderBy: {
      issuedAt: 'desc',
    },
  });

  return res.json({ attestations });
});

router.post('/trust-attestations', requireUserAuth, async (req, res) => {
  const parsed = attestationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'compliance:generate');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const attestation = await prisma.trustAttestation.create({
    data: {
      workspaceId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status ?? 'ACTIVE',
      issuedBy: parsed.data.issuedBy,
      issuedAt: parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : new Date(),
      isPublic: parsed.data.isPublic ?? true,
      artifactUrl: parsed.data.artifactUrl ?? null,
    },
  });

  return res.status(201).json({ attestation });
});

router.patch('/trust-attestations/:id', requireUserAuth, async (req, res) => {
  const attestationId = String(req.params.id);
  const parsed = attestationPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.trustAttestation.findUnique({
    where: {
      id: attestationId,
    },
  });

  if (!existing || !existing.workspaceId) {
    return res.status(404).json({ error: 'Attestation not found' });
  }

  const access = await assertWorkspacePermission(
    req.user!.id,
    existing.workspaceId,
    'compliance:generate',
  );
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const attestation = await prisma.trustAttestation.update({
    where: {
      id: existing.id,
    },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      issuedBy: parsed.data.issuedBy,
      issuedAt: parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : undefined,
      isPublic: parsed.data.isPublic,
      artifactUrl:
        parsed.data.artifactUrl === undefined ? undefined : (parsed.data.artifactUrl ?? null),
    },
  });

  return res.json({ attestation });
});

export default router;

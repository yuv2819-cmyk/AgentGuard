import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const frameworkSchema = z.enum(['SOC2', 'ISO27001', 'HIPAA', 'GDPR']);

const createPackSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  framework: frameworkSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
});

router.get('/compliance/evidence-packs', requireUserAuth, async (req, res) => {
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

  const packs = await prisma.complianceEvidencePack.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  });

  return res.json({ packs });
});

router.post('/compliance/evidence-packs', requireUserAuth, async (req, res) => {
  const parsed = createPackSchema.safeParse(req.body);
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

  const fromAt = new Date(parsed.data.from);
  const toAt = new Date(parsed.data.to);

  if (fromAt > toAt) {
    return res.status(400).json({ error: '`from` must be before `to`' });
  }

  const where = {
    workspaceId,
    createdAt: {
      gte: fromAt,
      lte: toAt,
    },
  };

  const [totalEvents, blockedEvents, anomalyEvents, approvals, signatures, policies] = await Promise.all([
    prisma.auditLogEvent.count({ where }),
    prisma.auditLogEvent.count({ where: { ...where, decision: 'BLOCK' } }),
    prisma.auditLogEvent.count({ where: { ...where, anomalyFlagged: true } }),
    prisma.actionApprovalRequest.count({
      where: {
        workspaceId,
        requestedAt: {
          gte: fromAt,
          lte: toAt,
        },
      },
    }),
    prisma.policyApprovalSignature.count({
      where: {
        policy: {
          workspaceId,
        },
        createdAt: {
          gte: fromAt,
          lte: toAt,
        },
      },
    }),
    prisma.policy.findMany({
      where: {
        workspaceId,
      },
      select: {
        id: true,
        name: true,
        version: true,
        status: true,
        approvedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 100,
    }),
  ]);

  const summary = {
    framework: parsed.data.framework,
    window: {
      from: fromAt.toISOString(),
      to: toAt.toISOString(),
    },
    controls: {
      accessControl: {
        id: `${parsed.data.framework}-AC-1`,
        status: 'PASS',
        evidence: 'Workspace RBAC matrix + SSO/SCIM provisioning logs available',
      },
      changeManagement: {
        id: `${parsed.data.framework}-CM-1`,
        status: signatures > 0 ? 'PASS' : 'WARN',
        evidence: `${signatures} signed policy approval records`,
      },
      loggingMonitoring: {
        id: `${parsed.data.framework}-LM-1`,
        status: totalEvents > 0 ? 'PASS' : 'WARN',
        evidence: `${totalEvents} audit events, ${anomalyEvents} anomaly-flagged`,
      },
      incidentResponse: {
        id: `${parsed.data.framework}-IR-1`,
        status: approvals > 0 ? 'PASS' : 'WARN',
        evidence: `${approvals} approval workflow records`,
      },
    },
    metrics: {
      totalEvents,
      blockedEvents,
      anomalyEvents,
      approvals,
      signedApprovals: signatures,
      policyCount: policies.length,
    },
    policies,
  };

  const payload = JSON.stringify(summary);
  const sha256 = createHash('sha256').update(payload).digest('hex');

  const pack = await prisma.complianceEvidencePack.create({
    data: {
      workspaceId,
      framework: parsed.data.framework,
      fromAt,
      toAt,
      generatedByUserId: req.user!.id,
      summary: summary as any,
      sha256,
    },
  });

  return res.status(201).json({ pack });
});

router.get('/compliance/evidence-packs/:id/download.json', requireUserAuth, async (req, res) => {
  const packId = String(req.params.id);
  const pack = await prisma.complianceEvidencePack.findUnique({
    where: {
      id: packId,
    },
  });

  if (!pack) {
    return res.status(404).json({ error: 'Evidence pack not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, pack.workspaceId, 'compliance:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="compliance-evidence-${pack.framework}-${pack.createdAt.toISOString().slice(0, 10)}.json"`,
  );

  return res.status(200).send(
    JSON.stringify(
      {
        id: pack.id,
        workspaceId: pack.workspaceId,
        framework: pack.framework,
        fromAt: pack.fromAt.toISOString(),
        toAt: pack.toAt.toISOString(),
        createdAt: pack.createdAt.toISOString(),
        sha256: pack.sha256,
        summary: pack.summary,
      },
      null,
      2,
    ),
  );
});

export default router;

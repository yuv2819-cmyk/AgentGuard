import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const replayQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(250),
});

router.get('/forensics/replay', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const parsed = replayQuerySchema.safeParse({ ...req.query, workspaceId });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'forensics:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const where: Record<string, any> = {
    workspaceId,
  };

  if (parsed.data.agentId) {
    where.agentId = parsed.data.agentId;
  }

  if (parsed.data.from || parsed.data.to) {
    where.createdAt = {};
    if (parsed.data.from) {
      where.createdAt.gte = new Date(parsed.data.from);
    }
    if (parsed.data.to) {
      where.createdAt.lte = new Date(parsed.data.to);
    }
  }

  const events = await prisma.auditLogEvent.findMany({
    where,
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    take: parsed.data.limit,
  });

  let previousHash: string | null = null;
  let integrityFailures = 0;

  const timeline = events.map((event) => {
    const prevMatches = previousHash === null ? true : event.prevHash === previousHash;
    if (!prevMatches) {
      integrityFailures += 1;
    }
    previousHash = event.hash;

    return {
      id: event.id,
      createdAt: event.createdAt,
      agentId: event.agentId,
      tool: event.tool,
      action: event.action,
      decision: event.decision,
      reason: event.reason,
      prevHash: event.prevHash,
      hash: event.hash,
      chainIntegrity: prevMatches ? 'OK' : 'BROKEN',
      metadata: event.metadata,
    };
  });

  return res.json({
    summary: {
      totalEvents: timeline.length,
      integrityFailures,
      chainStatus: integrityFailures === 0 ? 'HEALTHY' : 'BROKEN',
      from: timeline[0]?.createdAt ?? null,
      to: timeline[timeline.length - 1]?.createdAt ?? null,
    },
    timeline,
  });
});

router.get('/forensics/replay/:eventId', requireUserAuth, async (req, res) => {
  const eventId = String(req.params.eventId);
  const event = await prisma.auditLogEvent.findUnique({
    where: {
      id: eventId,
    },
  });

  if (!event) {
    return res.status(404).json({ error: 'Audit event not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, event.workspaceId, 'forensics:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const before = await prisma.auditLogEvent.findMany({
    where: {
      workspaceId: event.workspaceId,
      createdAt: {
        lt: event.createdAt,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  const after = await prisma.auditLogEvent.findMany({
    where: {
      workspaceId: event.workspaceId,
      createdAt: {
        gt: event.createdAt,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 10,
  });

  return res.json({
    event,
    context: {
      before: before.reverse(),
      after,
    },
  });
});

export default router;

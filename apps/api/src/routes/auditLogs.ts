import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const filtersSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  decision: z.enum(['ALLOW', 'BLOCK']).optional(),
  tool: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  anomaly_flagged: z.union([z.literal('true'), z.literal('false')]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

const exportFiltersSchema = filtersSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(10_000).default(2_000),
});

const csvEscape = (value: unknown): string => {
  const asString = String(value ?? '');
  if (asString.includes(',') || asString.includes('"') || asString.includes('\n')) {
    return `"${asString.replace(/"/g, '""')}"`;
  }
  return asString;
};

const buildWhere = (filters: z.infer<typeof filtersSchema>, workspaceId: string) => {
  const where: Record<string, any> = {
    workspaceId,
  };

  if (filters.agentId) {
    where.agentId = filters.agentId;
  }

  if (filters.decision) {
    where.decision = filters.decision;
  }

  if (filters.tool) {
    where.tool = filters.tool;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.anomaly_flagged) {
    where.anomalyFlagged = filters.anomaly_flagged === 'true';
  }

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = new Date(filters.from);
    }
    if (filters.to) {
      where.createdAt.lte = new Date(filters.to);
    }
  }

  if (filters.q) {
    where.OR = [
      {
        tool: {
          contains: filters.q,
          mode: 'insensitive',
        },
      },
      {
        action: {
          contains: filters.q,
          mode: 'insensitive',
        },
      },
      {
        resource: {
          contains: filters.q,
          mode: 'insensitive',
        },
      },
      {
        reason: {
          contains: filters.q,
          mode: 'insensitive',
        },
      },
    ];
  }

  return where;
};

router.get('/audit-logs', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const parsed = filtersSchema.safeParse({
    ...req.query,
    workspaceId,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'audit:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const where = buildWhere(parsed.data, workspaceId);
  const skip = (parsed.data.page - 1) * parsed.data.pageSize;

  const [total, data] = await Promise.all([
    prisma.auditLogEvent.count({ where }),
    prisma.auditLogEvent.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: parsed.data.pageSize,
    }),
  ]);

  return res.json({
    data,
    pagination: {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total,
      totalPages: Math.ceil(total / parsed.data.pageSize),
    },
  });
});

router.get('/audit-logs/export.csv', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const parsed = exportFiltersSchema.safeParse({
    ...req.query,
    workspaceId,
    page: 1,
    pageSize: 2_000,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'audit:read');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const where = buildWhere(parsed.data, workspaceId);

  const rows = await prisma.auditLogEvent.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: parsed.data.pageSize,
  });

  const from = parsed.data.from ? new Date(parsed.data.from).toISOString().slice(0, 10) : 'start';
  const to = parsed.data.to ? new Date(parsed.data.to).toISOString().slice(0, 10) : 'end';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-logs_${from}_to_${to}.csv"`);

  res.write(
    'id,workspace_id,agent_id,tool,action,resource,decision,reason,anomaly_flagged,metadata,prev_hash,hash,created_at\n',
  );

  for (const row of rows) {
    const csvRow = [
      row.id,
      row.workspaceId,
      row.agentId ?? '',
      row.tool,
      row.action,
      row.resource ?? '',
      row.decision,
      row.reason,
      row.anomalyFlagged,
      JSON.stringify(row.metadata ?? {}),
      row.prevHash,
      row.hash,
      row.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(',');

    res.write(`${csvRow}\n`);
  }

  res.end();
});

export default router;

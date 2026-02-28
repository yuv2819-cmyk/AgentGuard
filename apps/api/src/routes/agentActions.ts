import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashAgentKey } from '../lib/crypto.js';
import { evaluateAndLogAction } from '../services/actionService.js';

const router = Router();

const actionSchema = z.object({
  tool: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().max(255).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  approvalRequestId: z.string().uuid().optional(),
});

router.post('/agent/actions', async (req, res) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const rawKey = req.header('x-agent-key');
  if (!rawKey) {
    return res.status(401).json({ error: 'Missing X-Agent-Key header' });
  }

  const keyHash = hashAgentKey(rawKey);

  const apiKeyRecord = await prisma.agentApiKey.findUnique({
    where: {
      keyHash,
    },
    include: {
      agent: {
        select: {
          id: true,
          status: true,
          workspaceId: true,
          activePolicyId: true,
        },
      },
    },
  });

  if (!apiKeyRecord) {
    return res.status(401).json({ error: 'Invalid agent key' });
  }

  await prisma.agentApiKey.update({
    where: {
      id: apiKeyRecord.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  const forceBlockReason = apiKeyRecord.revokedAt ? 'key_revoked' : undefined;

  const result = await evaluateAndLogAction({
    prisma,
    workspaceId: apiKeyRecord.agent.workspaceId,
    agent: {
      id: apiKeyRecord.agent.id,
      status: apiKeyRecord.agent.status,
      activePolicyId: apiKeyRecord.agent.activePolicyId,
    },
    tool: parsed.data.tool,
    action: parsed.data.action,
    resource: parsed.data.resource ?? null,
    metadata: parsed.data.metadata,
    forceBlockReason,
    approvalRequestId: parsed.data.approvalRequestId,
    requestedBy: `AGENT:${apiKeyRecord.keyPrefix}`,
  });

  const statusCode = result.decision === 'BLOCK' ? 403 : 200;

  return res.status(statusCode).json({
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

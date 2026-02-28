import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface AuditEventInput {
  workspaceId: string;
  agentId?: string | null;
  tool: string;
  action: string;
  resource?: string | null;
  decision: 'ALLOW' | 'BLOCK';
  reason: string;
  metadata?: Record<string, unknown>;
  anomalyFlagged?: boolean;
  createdAt?: Date;
}

const sortObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObject(obj[key]);
        return acc;
      }, {});
  }

  return value;
};

export const canonicalize = (value: unknown): string => JSON.stringify(sortObject(value));

export const computeEventHash = (prevHash: string, payload: unknown): string =>
  createHash('sha256').update(prevHash + canonicalize(payload)).digest('hex');

const createEventHashPayload = (event: AuditEventInput, createdAt: Date) => ({
  workspace_id: event.workspaceId,
  agent_id: event.agentId ?? null,
  tool: event.tool,
  action: event.action,
  resource: event.resource ?? null,
  decision: event.decision,
  reason: event.reason,
  metadata: event.metadata ?? {},
  anomaly_flagged: Boolean(event.anomalyFlagged),
  created_at: createdAt.toISOString(),
});

export const appendAuditEvent = async (
  db: PrismaClient,
  event: AuditEventInput,
) => {
  return db.$transaction(async (tx: any) => {
    const state = await tx.auditChainState.findUnique({
      where: {
        workspaceId: event.workspaceId,
      },
    });

    const prevHash = state?.lastHash ?? 'GENESIS';
    const createdAt = event.createdAt ?? new Date();
    const hashPayload = createEventHashPayload(event, createdAt);
    const hash = computeEventHash(prevHash, hashPayload);

    const createdEvent = await tx.auditLogEvent.create({
      data: {
        workspaceId: event.workspaceId,
        agentId: event.agentId ?? null,
        tool: event.tool,
        action: event.action,
        resource: event.resource ?? null,
        decision: event.decision,
        reason: event.reason,
        metadata: (event.metadata ?? {}) as any,
        anomalyFlagged: Boolean(event.anomalyFlagged),
        prevHash,
        hash,
        createdAt,
      },
    });

    await tx.auditChainState.upsert({
      where: {
        workspaceId: event.workspaceId,
      },
      create: {
        workspaceId: event.workspaceId,
        lastEventId: createdEvent.id,
        lastHash: hash,
      },
      update: {
        lastEventId: createdEvent.id,
        lastHash: hash,
      },
    });

    return createdEvent;
  });
};

export const verifyHashChain = (
  events: Array<{
    workspaceId: string;
    agentId: string | null;
    tool: string;
    action: string;
    resource: string | null;
    decision: 'ALLOW' | 'BLOCK';
    reason: string;
    metadata: Record<string, unknown>;
    anomalyFlagged: boolean;
    createdAt: Date;
    prevHash: string;
    hash: string;
  }>,
): boolean => {
  let lastHash = 'GENESIS';

  for (const event of events) {
    if (event.prevHash !== lastHash) {
      return false;
    }

    const payload = createEventHashPayload(
      {
        workspaceId: event.workspaceId,
        agentId: event.agentId,
        tool: event.tool,
        action: event.action,
        resource: event.resource,
        decision: event.decision,
        reason: event.reason,
        metadata: event.metadata,
        anomalyFlagged: event.anomalyFlagged,
      },
      event.createdAt,
    );

    const expected = computeEventHash(event.prevHash, payload);
    if (event.hash !== expected) {
      return false;
    }

    lastHash = event.hash;
  }

  return true;
};

import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const WEBHOOK_TIMEOUT_MS = 3_000;

const signPayload = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

export const dispatchAuditEventToIntegrations = async (
  prisma: PrismaClient,
  payload: {
    workspaceId: string;
    eventId: string;
    agentId: string | null;
    decision: 'ALLOW' | 'BLOCK';
    reason: string;
    riskScore: number;
    anomalyFlagged: boolean;
    tool: string;
    action: string;
    createdAt: string;
  },
) => {
  const integrations = await prisma.workspaceIntegration.findMany({
    where: {
      workspaceId: payload.workspaceId,
      active: true,
      type: 'GENERIC_WEBHOOK',
    },
  });

  if (integrations.length === 0) {
    return;
  }

  const body = JSON.stringify({
    eventType: 'audit_event',
    source: 'agentguard',
    payload,
  });

  await Promise.all(
    integrations.map(async (integration) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (integration.signingSecret) {
          headers['X-AgentGuard-Signature'] = signPayload(body, integration.signingSecret);
        }

        await fetch(integration.webhookUrl, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
};

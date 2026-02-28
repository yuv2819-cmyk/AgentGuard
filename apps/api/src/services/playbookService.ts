import type { PrismaClient } from '@prisma/client';

interface PlaybookInput {
  prisma: PrismaClient;
  workspaceId: string;
  agentId: string | null;
  eventId: string;
  decision: 'ALLOW' | 'BLOCK';
  riskScore: number;
  signals: string[];
  tool: string;
  action: string;
  resource: string | null;
  metadata: Record<string, unknown>;
}

const getSignalMatchers = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
};

const executeWebhook = async (
  url: string,
  secret: string | null,
  payload: Record<string, unknown>,
): Promise<void> => {
  await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-playbook-secret': secret } : {}),
    },
    body: JSON.stringify(payload),
  });
};

export const runPlaybooksForEvent = async ({
  prisma,
  workspaceId,
  agentId,
  eventId,
  decision,
  riskScore,
  signals,
  tool,
  action,
  resource,
  metadata,
}: PlaybookInput): Promise<void> => {
  const playbooks = await prisma.workspacePlaybook.findMany({
    where: {
      workspaceId,
      enabled: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  for (const playbook of playbooks) {
    const requiredSignals = getSignalMatchers(playbook.matchSignals);
    const decisionMatch = !playbook.triggerDecision || playbook.triggerDecision === decision;
    const riskMatch = riskScore >= playbook.minRiskScore;
    const signalsMatch =
      requiredSignals.length === 0 ||
      requiredSignals.every((signal) => signals.includes(signal));

    if (!decisionMatch || !riskMatch || !signalsMatch) {
      await prisma.playbookExecution.create({
        data: {
          playbookId: playbook.id,
          workspaceId,
          agentId,
          eventId,
          status: 'SKIPPED',
          message: 'Trigger conditions not met',
        },
      });
      continue;
    }

    try {
      const actionConfig = (playbook.actionConfig ?? {}) as Record<string, unknown>;
      let message = 'Executed';

      switch (playbook.actionType) {
        case 'DISABLE_AGENT': {
          if (!agentId) {
            message = 'No agent available to disable';
            break;
          }
          await prisma.agent.update({
            where: {
              id: agentId,
            },
            data: {
              status: 'DISABLED',
            },
          });
          message = 'Agent disabled by playbook';
          break;
        }
        case 'REVOKE_ACTIVE_KEYS': {
          if (!agentId) {
            message = 'No agent available to revoke keys';
            break;
          }
          await prisma.agentApiKey.updateMany({
            where: {
              agentId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
          message = 'Active keys revoked by playbook';
          break;
        }
        case 'CREATE_APPROVAL': {
          if (!agentId) {
            message = 'No agent available for approval request';
            break;
          }

          const ttlMinutesRaw = Number(actionConfig.ttlMinutes ?? 15);
          const ttlMinutes = Number.isFinite(ttlMinutesRaw) ? Math.max(1, ttlMinutesRaw) : 15;

          await prisma.actionApprovalRequest.create({
            data: {
              workspaceId,
              agentId,
              tool,
              action,
              resource,
              metadata: {
                ...metadata,
                source: 'playbook',
                playbookId: playbook.id,
                eventId,
              } as any,
              status: 'PENDING',
              riskScore,
              requestedBy: `PLAYBOOK:${playbook.name}`,
              expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
            },
          });
          message = 'Approval request created by playbook';
          break;
        }
        case 'NOTIFY_WEBHOOK': {
          const url = typeof actionConfig.url === 'string' ? actionConfig.url : '';
          const secret = typeof actionConfig.secret === 'string' ? actionConfig.secret : null;
          if (!url) {
            message = 'Webhook URL missing in playbook actionConfig';
            break;
          }

          await executeWebhook(url, secret, {
            playbookId: playbook.id,
            workspaceId,
            agentId,
            eventId,
            decision,
            riskScore,
            signals,
            tool,
            action,
            resource,
            metadata,
            timestamp: new Date().toISOString(),
          });
          message = 'Webhook notification sent by playbook';
          break;
        }
        default:
          message = `Unsupported action type ${playbook.actionType}`;
      }

      await prisma.playbookExecution.create({
        data: {
          playbookId: playbook.id,
          workspaceId,
          agentId,
          eventId,
          status: 'EXECUTED',
          message,
        },
      });
    } catch (error) {
      await prisma.playbookExecution.create({
        data: {
          playbookId: playbook.id,
          workspaceId,
          agentId,
          eventId,
          status: 'FAILED',
          message: error instanceof Error ? error.message : 'Unknown playbook failure',
        },
      });
    }
  }
};

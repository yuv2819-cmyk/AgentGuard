import { appendAuditEvent } from '../lib/hashChain.js';
import { HIGH_RISK_ACTIONS, evaluatePolicy, normalizePolicyRules } from '../lib/policyEngine.js';
import { computeRiskScore, requiresHumanApproval } from '../lib/risk.js';
import { runPlaybooksForEvent } from './playbookService.js';
import { dispatchAuditEventToIntegrations } from './siemService.js';
import type { PrismaClient } from '@prisma/client';

interface EvaluateAndLogInput {
  prisma: PrismaClient;
  workspaceId: string;
  agent: {
    id: string;
    status: 'ACTIVE' | 'DISABLED';
    activePolicyId: string | null;
  };
  tool: string;
  action: string;
  resource?: string | null;
  metadata?: Record<string, unknown>;
  forceBlockReason?: string;
  approvalRequestId?: string;
  requestedBy?: string;
}

const APPROVAL_TTL_MS = 15 * 60 * 1000;

export const evaluateAndLogAction = async ({
  prisma,
  workspaceId,
  agent,
  tool,
  action,
  resource,
  metadata,
  forceBlockReason,
  approvalRequestId,
  requestedBy,
}: EvaluateAndLogInput) => {
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const now = new Date();
  const burstRate = await prisma.auditLogEvent.count({
    where: {
      workspaceId,
      agentId: agent.id,
      createdAt: {
        gte: oneMinuteAgo,
      },
    },
  });
  const baseline = await prisma.agentActionBaseline.findUnique({
    where: {
      agentId_tool_action: {
        agentId: agent.id,
        tool,
        action,
      },
    },
  });

  let decision: 'ALLOW' | 'BLOCK' = 'ALLOW';
  let reason = 'allowed_by_policy_engine';
  let signals: string[] = [];
  let approvalId: string | null = null;

  let rules = normalizePolicyRules({
    mode: 'BALANCED',
    allow_actions: [],
    deny_actions: [],
    allow_tools: [],
    deny_tools: [],
    require_approval_actions: [],
  });

  if (forceBlockReason) {
    decision = 'BLOCK';
    reason = forceBlockReason;
  } else if (agent.status === 'DISABLED') {
    decision = 'BLOCK';
    reason = 'agent_disabled';
  } else {
    if (agent.activePolicyId) {
      const policy = await prisma.policy.findFirst({
        where: {
          id: agent.activePolicyId,
          workspaceId,
        },
      });

      if (policy) {
        rules = normalizePolicyRules(
          {
            ...(policy.rules as Record<string, unknown>),
            mode: policy.mode,
          },
          policy.mode,
        );

        if (policy.status !== 'APPROVED') {
          decision = 'BLOCK';
          reason = 'policy_not_approved';
        }
      }
    }

    if (decision !== 'BLOCK') {
      const evaluated = evaluatePolicy(rules, {
        tool,
        action,
        resource,
        metadata,
        burstRate,
      });

      decision = evaluated.decision;
      reason = evaluated.reason;
      signals = evaluated.signals;
    }
  }

  const isOffHours = now.getUTCHours() < 5 || now.getUTCHours() > 20;
  const baselineAvgPerMinute = baseline?.avgPerMinute ?? 0;
  const baselineSampleCount = baseline?.sampleCount ?? 0;
  const burstMultiplier =
    baselineAvgPerMinute > 0 ? burstRate / Math.max(1, baselineAvgPerMinute) : 1;

  if (baselineSampleCount >= 5 && burstMultiplier >= 2) {
    signals.push('behavior_drift');
  }

  if (baselineSampleCount < 3) {
    signals.push('new_action_pattern');
  }

  if (isOffHours && HIGH_RISK_ACTIONS.has(action.toLowerCase())) {
    signals.push('off_hours_execution');
  }

  if (decision === 'ALLOW' && requiresHumanApproval(action, rules)) {
    let approvedRequest: { id: string } | null = null;

    if (approvalRequestId) {
      approvedRequest = await prisma.actionApprovalRequest.findFirst({
        where: {
          id: approvalRequestId,
          workspaceId,
          agentId: agent.id,
          status: 'APPROVED',
          consumedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
        },
      });

      if (approvedRequest) {
        await prisma.actionApprovalRequest.update({
          where: {
            id: approvedRequest.id,
          },
          data: {
            consumedAt: new Date(),
          },
        });

        signals.push('human_approval_consumed');
      }
    }

    if (!approvedRequest) {
      decision = 'BLOCK';
      reason = 'approval_required';
      signals.push('human_approval_required');

      const createdApproval = await prisma.actionApprovalRequest.create({
        data: {
          workspaceId,
          agentId: agent.id,
          tool,
          action,
          resource: resource ?? null,
          metadata: (metadata ?? {}) as any,
          status: 'PENDING',
          requestedBy: requestedBy ?? 'SYSTEM',
          expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
        },
        select: {
          id: true,
        },
      });

      approvalId = createdApproval.id;
    }
  }

  const anomalyFlagged = signals.length > 0;
  const uniqueSignals = [...new Set(signals)];
  const riskScore = computeRiskScore(uniqueSignals, action, decision, {
    baselineAvgRiskScore: baseline?.avgRiskScore ?? 0,
    baselineAvgPerMinute,
    burstRate,
    isOffHours,
    isNewPattern: baselineSampleCount < 3,
  });

  const event = await appendAuditEvent(prisma, {
    workspaceId,
    agentId: agent.id,
    tool,
    action,
    resource,
    decision,
    reason,
    metadata: {
      ...(metadata ?? {}),
      signals: uniqueSignals,
      risk_score: riskScore,
      approval_request_id: approvalId,
      risk_context: {
        baseline_avg_risk: baseline?.avgRiskScore ?? 0,
        baseline_avg_per_minute: baselineAvgPerMinute,
        burst_rate: burstRate,
      },
    },
    anomalyFlagged,
  });

  const nextSampleCount = (baseline?.sampleCount ?? 0) + 1;
  const nextAverageRisk =
    ((baseline?.avgRiskScore ?? 0) * (baseline?.sampleCount ?? 0) + riskScore) / nextSampleCount;
  const nextAveragePerMinute =
    ((baseline?.avgPerMinute ?? 0) * (baseline?.sampleCount ?? 0) + burstRate) / nextSampleCount;

  await prisma.agentActionBaseline.upsert({
    where: {
      agentId_tool_action: {
        agentId: agent.id,
        tool,
        action,
      },
    },
    create: {
      workspaceId,
      agentId: agent.id,
      tool,
      action,
      avgRiskScore: riskScore,
      avgPerMinute: burstRate,
      sampleCount: 1,
      lastSeenAt: now,
    },
    update: {
      avgRiskScore: Number(nextAverageRisk.toFixed(2)),
      avgPerMinute: Number(nextAveragePerMinute.toFixed(2)),
      sampleCount: nextSampleCount,
      lastSeenAt: now,
    },
  });

  await runPlaybooksForEvent({
    prisma,
    workspaceId,
    agentId: agent.id,
    eventId: event.id,
    decision,
    riskScore,
    signals: uniqueSignals,
    tool,
    action,
    resource: resource ?? null,
    metadata: metadata ?? {},
  });

  void dispatchAuditEventToIntegrations(prisma, {
    workspaceId,
    eventId: event.id,
    agentId: event.agentId,
    decision: event.decision,
    reason: event.reason,
    riskScore,
    anomalyFlagged,
    tool: event.tool,
    action: event.action,
    createdAt: event.createdAt.toISOString(),
  }).catch((error) => {
    console.error('SIEM forward failed', error);
  });

  return {
    decision,
    reason,
    signals: uniqueSignals,
    riskScore,
    approvalRequestId: approvalId,
    event,
  };
};

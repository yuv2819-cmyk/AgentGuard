import type { PolicyEvaluationContext, PolicyEvaluationResult, PolicyRules } from '@agentguard/shared';
import { z } from 'zod';

const rulesSchema = z.object({
  mode: z.enum(['STRICT', 'BALANCED']).default('BALANCED'),
  allow_actions: z.array(z.string().min(1)).default([]),
  deny_actions: z.array(z.string().min(1)).default([]),
  allow_tools: z.array(z.string().min(1)).default([]),
  deny_tools: z.array(z.string().min(1)).default([]),
  require_approval_actions: z.array(z.string().min(1)).default([]),
});

export const HIGH_RISK_ACTIONS = new Set([
  'delete',
  'drop',
  'transfer_funds',
  'write_prod',
  'admin_override',
  'terminate',
]);

export const normalizePolicyRules = (rules: unknown, mode?: 'STRICT' | 'BALANCED'): PolicyRules => {
  const parsed = rulesSchema.parse(rules ?? {});
  return {
    ...parsed,
    mode: mode ?? parsed.mode,
  };
};

export const evaluatePolicy = (
  inputRules: unknown,
  ctx: PolicyEvaluationContext,
): PolicyEvaluationResult => {
  const rules = normalizePolicyRules(inputRules);
  const signals = new Set<string>();

  if (HIGH_RISK_ACTIONS.has(ctx.action.toLowerCase())) {
    signals.add('high_risk_action');
  }

  const allowToolsSet = new Set(rules.allow_tools);
  const allowActionsSet = new Set(rules.allow_actions);

  if (rules.allow_tools.length > 0 && !allowToolsSet.has(ctx.tool)) {
    signals.add('unknown_tool');
  }

  if (typeof ctx.burstRate === 'number' && ctx.burstRate >= 5) {
    signals.add('burst_rate');
  }

  if (rules.deny_actions.includes(ctx.action)) {
    return { decision: 'BLOCK', reason: 'action_denied_by_policy', signals: [...signals] };
  }

  if (rules.deny_tools.includes(ctx.tool)) {
    return { decision: 'BLOCK', reason: 'tool_denied_by_policy', signals: [...signals] };
  }

  if (rules.mode === 'STRICT') {
    if (rules.allow_actions.length > 0 && !allowActionsSet.has(ctx.action)) {
      return {
        decision: 'BLOCK',
        reason: 'action_not_allowlisted_strict',
        signals: [...signals],
      };
    }

    if (rules.allow_tools.length > 0 && !allowToolsSet.has(ctx.tool)) {
      return {
        decision: 'BLOCK',
        reason: 'tool_not_allowlisted_strict',
        signals: [...signals],
      };
    }
  }

  return {
    decision: 'ALLOW',
    reason: 'allowed_by_policy_engine',
    signals: [...signals],
  };
};

import type { PolicyRules } from '@agentguard/shared';
import { HIGH_RISK_ACTIONS } from './policyEngine.js';

export const requiresHumanApproval = (action: string, rules: PolicyRules): boolean => {
  if (HIGH_RISK_ACTIONS.has(action.toLowerCase())) {
    return true;
  }

  return (rules.require_approval_actions ?? []).includes(action);
};

interface RiskScoreContext {
  baselineAvgRiskScore?: number;
  baselineAvgPerMinute?: number;
  burstRate?: number;
  isOffHours?: boolean;
  isNewPattern?: boolean;
}

export const computeRiskScore = (
  signals: string[],
  action: string,
  decision: 'ALLOW' | 'BLOCK',
  context: RiskScoreContext = {},
): number => {
  let score = 5;

  if (HIGH_RISK_ACTIONS.has(action.toLowerCase())) {
    score += 45;
  }

  if (signals.includes('unknown_tool')) {
    score += 20;
  }

  if (signals.includes('burst_rate')) {
    score += 20;
  }

  if (signals.includes('behavior_drift')) {
    score += 15;
  }

  if (signals.includes('off_hours_execution')) {
    score += 10;
  }

  if (signals.includes('new_action_pattern')) {
    score += 12;
  }

  if (decision === 'BLOCK') {
    score += 10;
  }

  if ((context.burstRate ?? 0) > 0 && (context.baselineAvgPerMinute ?? 0) > 0) {
    const multiplier = (context.burstRate ?? 0) / Math.max(1, context.baselineAvgPerMinute ?? 0);
    if (multiplier >= 3) {
      score += 12;
    } else if (multiplier >= 2) {
      score += 6;
    }
  }

  if ((context.baselineAvgRiskScore ?? 0) > 0 && decision === 'ALLOW') {
    score += Math.round(Math.min(8, (context.baselineAvgRiskScore ?? 0) / 20));
  }

  if (context.isOffHours) {
    score += 5;
  }

  if (context.isNewPattern) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
};

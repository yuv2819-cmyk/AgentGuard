import { describe, expect, it } from 'vitest';
import { computeRiskScore, requiresHumanApproval } from '../../src/lib/risk.js';

describe('risk helpers', () => {
  it('requires approval for high-risk actions', () => {
    expect(
      requiresHumanApproval('transfer_funds', {
        mode: 'BALANCED',
        allow_actions: [],
        deny_actions: [],
        allow_tools: [],
        deny_tools: [],
        require_approval_actions: [],
      }),
    ).toBe(true);
  });

  it('requires approval for configured actions', () => {
    expect(
      requiresHumanApproval('export_csv', {
        mode: 'BALANCED',
        allow_actions: [],
        deny_actions: [],
        allow_tools: [],
        deny_tools: [],
        require_approval_actions: ['export_csv'],
      }),
    ).toBe(true);
  });

  it('computes higher risk score with anomaly signals', () => {
    const score = computeRiskScore(['unknown_tool', 'burst_rate'], 'transfer_funds', 'BLOCK');
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('adds extra risk under behavior drift context', () => {
    const base = computeRiskScore([], 'read', 'ALLOW', {
      baselineAvgPerMinute: 2,
      burstRate: 2,
      baselineAvgRiskScore: 10,
    });
    const drift = computeRiskScore(['behavior_drift'], 'read', 'ALLOW', {
      baselineAvgPerMinute: 2,
      burstRate: 6,
      baselineAvgRiskScore: 10,
      isOffHours: true,
    });

    expect(drift).toBeGreaterThan(base);
  });
});

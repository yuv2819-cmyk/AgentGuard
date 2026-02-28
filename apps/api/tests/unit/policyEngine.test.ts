import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../../src/lib/policyEngine.js';

describe('policy engine', () => {
  it('blocks denied action even if allowlisted', () => {
    const result = evaluatePolicy(
      {
        mode: 'STRICT',
        allow_actions: ['delete'],
        deny_actions: ['delete'],
        allow_tools: ['crm'],
        deny_tools: [],
      },
      {
        tool: 'crm',
        action: 'delete',
      },
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toBe('action_denied_by_policy');
  });

  it('strict mode blocks unknown tool when allowlist exists', () => {
    const result = evaluatePolicy(
      {
        mode: 'STRICT',
        allow_actions: ['read'],
        deny_actions: [],
        allow_tools: ['knowledge_base'],
        deny_tools: [],
      },
      {
        tool: 'unknown',
        action: 'read',
      },
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toBe('tool_not_allowlisted_strict');
    expect(result.signals).toContain('unknown_tool');
  });

  it('balanced mode allows unknown tool but flags anomaly', () => {
    const result = evaluatePolicy(
      {
        mode: 'BALANCED',
        allow_actions: ['read'],
        deny_actions: [],
        allow_tools: ['knowledge_base'],
        deny_tools: [],
      },
      {
        tool: 'unknown',
        action: 'read',
      },
    );

    expect(result.decision).toBe('ALLOW');
    expect(result.signals).toContain('unknown_tool');
  });
});

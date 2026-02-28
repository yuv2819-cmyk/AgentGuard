import { describe, expect, it } from 'vitest';
import { computeEventHash, verifyHashChain } from '../../src/lib/hashChain.js';

describe('hash chain', () => {
  it('computes deterministic hashes and validates full chain', () => {
    const eventOnePayload = {
      workspace_id: 'w1',
      agent_id: 'a1',
      tool: 'kb',
      action: 'read',
      resource: 'doc:1',
      decision: 'ALLOW',
      reason: 'ok',
      metadata: { foo: 'bar' },
      anomaly_flagged: false,
      created_at: '2026-02-26T00:00:00.000Z',
    };

    const hashOne = computeEventHash('GENESIS', eventOnePayload);

    const eventTwoPayload = {
      workspace_id: 'w1',
      agent_id: 'a1',
      tool: 'db',
      action: 'delete',
      resource: 'doc:2',
      decision: 'BLOCK',
      reason: 'denied',
      metadata: { foo: 'baz' },
      anomaly_flagged: true,
      created_at: '2026-02-26T00:01:00.000Z',
    };

    const hashTwo = computeEventHash(hashOne, eventTwoPayload);

    const valid = verifyHashChain([
      {
        workspaceId: 'w1',
        agentId: 'a1',
        tool: 'kb',
        action: 'read',
        resource: 'doc:1',
        decision: 'ALLOW',
        reason: 'ok',
        metadata: { foo: 'bar' },
        anomalyFlagged: false,
        createdAt: new Date('2026-02-26T00:00:00.000Z'),
        prevHash: 'GENESIS',
        hash: hashOne,
      },
      {
        workspaceId: 'w1',
        agentId: 'a1',
        tool: 'db',
        action: 'delete',
        resource: 'doc:2',
        decision: 'BLOCK',
        reason: 'denied',
        metadata: { foo: 'baz' },
        anomalyFlagged: true,
        createdAt: new Date('2026-02-26T00:01:00.000Z'),
        prevHash: hashOne,
        hash: hashTwo,
      },
    ]);

    expect(valid).toBe(true);
  });

  it('detects tampering in hash chain', () => {
    const valid = verifyHashChain([
      {
        workspaceId: 'w1',
        agentId: 'a1',
        tool: 'kb',
        action: 'read',
        resource: 'doc:1',
        decision: 'ALLOW',
        reason: 'ok',
        metadata: { foo: 'bar' },
        anomalyFlagged: false,
        createdAt: new Date('2026-02-26T00:00:00.000Z'),
        prevHash: 'GENESIS',
        hash: 'broken',
      },
    ]);

    expect(valid).toBe(false);
  });
});

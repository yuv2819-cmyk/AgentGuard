import { describe, expect, it } from 'vitest';
import { generateRawAgentKey, getKeyPrefix, hashAgentKey } from '../../src/lib/crypto.js';

describe('agent key verification helpers', () => {
  it('creates stable salted hash values', () => {
    const key = 'agk_test_key_123';
    const one = hashAgentKey(key);
    const two = hashAgentKey(key);

    expect(one).toBe(two);
    expect(one).toHaveLength(64);
  });

  it('generates valid prefix', () => {
    const key = generateRawAgentKey();
    expect(key.startsWith('agk_')).toBe(true);
    expect(getKeyPrefix(key).length).toBe(6);
  });

  it('hashes distinct keys differently', () => {
    const a = hashAgentKey('agk_a');
    const b = hashAgentKey('agk_b');

    expect(a).not.toBe(b);
  });
});

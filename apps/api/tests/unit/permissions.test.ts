import { describe, expect, it } from 'vitest';
import { hasWorkspacePermission } from '../../src/lib/permissions.js';

describe('workspace permissions', () => {
  it('allows owners to approve policies', () => {
    expect(hasWorkspacePermission('OWNER', 'policies:approve')).toBe(true);
  });

  it('prevents members from rotating keys', () => {
    expect(hasWorkspacePermission('MEMBER', 'agents:rotate_keys')).toBe(false);
  });

  it('allows members to run simulations', () => {
    expect(hasWorkspacePermission('MEMBER', 'simulate:run')).toBe(true);
  });

  it('respects explicit deny overrides', () => {
    expect(hasWorkspacePermission('OWNER', 'agents:write', 'DENY')).toBe(false);
  });

  it('respects explicit allow overrides', () => {
    expect(hasWorkspacePermission('MEMBER', 'agents:rotate_keys', 'ALLOW')).toBe(true);
  });
});

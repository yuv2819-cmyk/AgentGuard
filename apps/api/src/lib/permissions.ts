import type { Role } from '@prisma/client';

export type WorkspacePermission =
  | 'workspace:create'
  | 'workspace:manage_members'
  | 'rbac:manage'
  | 'identity:manage'
  | 'agents:read'
  | 'agents:write'
  | 'agents:rotate_keys'
  | 'agents:kill_switch'
  | 'policies:read'
  | 'policies:write'
  | 'policies:approve'
  | 'policy_sync:manage'
  | 'simulate:run'
  | 'runtime:manage'
  | 'audit:read'
  | 'forensics:read'
  | 'approvals:read'
  | 'approvals:manage'
  | 'playbooks:read'
  | 'playbooks:manage'
  | 'integrations:manage'
  | 'compliance:read'
  | 'compliance:generate';

export type PermissionOverrideEffect = 'ALLOW' | 'DENY';

export const ALL_WORKSPACE_PERMISSIONS: WorkspacePermission[] = [
  'workspace:create',
  'workspace:manage_members',
  'rbac:manage',
  'identity:manage',
  'agents:read',
  'agents:write',
  'agents:rotate_keys',
  'agents:kill_switch',
  'policies:read',
  'policies:write',
  'policies:approve',
  'policy_sync:manage',
  'simulate:run',
  'runtime:manage',
  'audit:read',
  'forensics:read',
  'approvals:read',
  'approvals:manage',
  'playbooks:read',
  'playbooks:manage',
  'integrations:manage',
  'compliance:read',
  'compliance:generate',
];

const OWNER_PERMISSIONS = new Set<WorkspacePermission>([
  'workspace:create',
  'workspace:manage_members',
  'rbac:manage',
  'identity:manage',
  'agents:read',
  'agents:write',
  'agents:rotate_keys',
  'agents:kill_switch',
  'policies:read',
  'policies:write',
  'policies:approve',
  'policy_sync:manage',
  'simulate:run',
  'runtime:manage',
  'audit:read',
  'forensics:read',
  'approvals:read',
  'approvals:manage',
  'playbooks:read',
  'playbooks:manage',
  'integrations:manage',
  'compliance:read',
  'compliance:generate',
]);

const MEMBER_PERMISSIONS = new Set<WorkspacePermission>([
  'agents:read',
  'policies:read',
  'simulate:run',
  'audit:read',
  'forensics:read',
  'approvals:read',
  'playbooks:read',
  'compliance:read',
]);

const ROLE_TO_PERMISSIONS: Record<Role, Set<WorkspacePermission>> = {
  OWNER: OWNER_PERMISSIONS,
  MEMBER: MEMBER_PERMISSIONS,
};

export const hasWorkspacePermission = (
  role: Role,
  permission: WorkspacePermission,
  overrideEffect?: PermissionOverrideEffect | null,
): boolean => {
  if (overrideEffect === 'ALLOW') {
    return true;
  }

  if (overrideEffect === 'DENY') {
    return false;
  }

  return ROLE_TO_PERMISSIONS[role].has(permission);
};

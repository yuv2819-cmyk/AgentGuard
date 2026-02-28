import type { Request } from 'express';
import type { WorkspacePermission } from './permissions.js';
import { prisma } from '../db.js';
import { hasWorkspacePermission } from './permissions.js';

export const resolveWorkspaceId = (req: Request): string | null => {
  const headerValue = req.header('x-workspace-id');
  if (headerValue) {
    return headerValue;
  }

  const queryValue = req.query.workspaceId;
  if (typeof queryValue === 'string') {
    return queryValue;
  }

  const bodyValue = (req.body as { workspaceId?: unknown })?.workspaceId;
  if (typeof bodyValue === 'string') {
    return bodyValue;
  }

  return null;
};

export const assertWorkspaceMember = async (userId: string, workspaceId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  return membership;
};

export const assertWorkspacePermission = async (
  userId: string,
  workspaceId: string,
  permission: WorkspacePermission,
) => {
  const membership = await assertWorkspaceMember(userId, workspaceId);
  if (!membership) {
    return null;
  }

  const override = await prisma.workspaceRolePermission.findUnique({
    where: {
      workspaceId_role_permission: {
        workspaceId,
        role: membership.role,
        permission,
      },
    },
    select: {
      effect: true,
    },
  });

  if (!hasWorkspacePermission(membership.role, permission, override?.effect)) {
    return { membership, authorized: false as const, overrideEffect: override?.effect ?? null };
  }

  return { membership, authorized: true as const, overrideEffect: override?.effect ?? null };
};

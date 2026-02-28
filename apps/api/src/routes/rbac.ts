import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  ALL_WORKSPACE_PERMISSIONS,
  hasWorkspacePermission,
  type WorkspacePermission,
} from '../lib/permissions.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const roleSchema = z.enum(['OWNER', 'MEMBER']);
const effectSchema = z.union([z.literal('ALLOW'), z.literal('DENY'), z.null()]);

const overrideItemSchema = z.object({
  role: roleSchema,
  permission: z.string().min(1),
  effect: effectSchema,
});

const updateOverridesSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  overrides: z.array(overrideItemSchema).max(500),
});

const workspacePermissions = new Set<WorkspacePermission>(ALL_WORKSPACE_PERMISSIONS);

const buildPermissionMatrix = async (workspaceId: string) => {
  const overrides = await prisma.workspaceRolePermission.findMany({
    where: {
      workspaceId,
    },
  });

  const overrideMap = new Map<string, 'ALLOW' | 'DENY'>();
  for (const override of overrides) {
    overrideMap.set(`${override.role}:${override.permission}`, override.effect);
  }

  const roles: Array<'OWNER' | 'MEMBER'> = ['OWNER', 'MEMBER'];
  const matrix = roles.map((role) => {
    const permissions = ALL_WORKSPACE_PERMISSIONS.map((permission) => {
      const overrideEffect = overrideMap.get(`${role}:${permission}`) ?? null;
      return {
        permission,
        effective: hasWorkspacePermission(role, permission, overrideEffect),
        overrideEffect,
      };
    });

    return { role, permissions };
  });

  return { matrix, overrides };
};

router.get('/rbac/permissions', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'rbac:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const data = await buildPermissionMatrix(workspaceId);
  return res.json(data);
});

router.put('/rbac/permissions', requireUserAuth, async (req, res) => {
  const parsed = updateOverridesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'rbac:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  for (const override of parsed.data.overrides) {
    if (!workspacePermissions.has(override.permission as WorkspacePermission)) {
      return res.status(400).json({ error: `Unknown workspace permission: ${override.permission}` });
    }
  }

  await prisma.$transaction(async (tx: any) => {
    for (const override of parsed.data.overrides) {
      const permission = override.permission as WorkspacePermission;
      if (override.effect === null) {
        await tx.workspaceRolePermission.deleteMany({
          where: {
            workspaceId,
            role: override.role,
            permission,
          },
        });
      } else {
        await tx.workspaceRolePermission.upsert({
          where: {
            workspaceId_role_permission: {
              workspaceId,
              role: override.role,
              permission,
            },
          },
          create: {
            workspaceId,
            role: override.role,
            permission,
            effect: override.effect,
          },
          update: {
            effect: override.effect,
          },
        });
      }
    }
  });

  const data = await buildPermissionMatrix(workspaceId);
  return res.json(data);
});

export default router;

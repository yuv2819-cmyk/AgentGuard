import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertWorkspacePermission } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(100),
  timezone: z.string().min(2).default('Asia/Kolkata'),
});

const upsertMemberSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(['OWNER', 'MEMBER']).default('MEMBER'),
});

router.get('/workspaces', requireUserAuth, async (req, res) => {
  const userId = req.user!.id;

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
    },
    include: {
      workspace: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return res.json({
    workspaces: memberships.map((membership: any) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      timezone: membership.workspace.timezone,
      role: membership.role,
      createdAt: membership.workspace.createdAt,
    })),
  });
});

router.post('/workspaces', requireUserAuth, async (req, res) => {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const userId = req.user!.id;
  const { name, timezone } = parsed.data;

  const workspace = await prisma.$transaction(async (tx: any) => {
    const createdWorkspace = await tx.workspace.create({
      data: {
        name,
        timezone,
      },
    });

    const membership = await tx.workspaceMember.create({
      data: {
        workspaceId: createdWorkspace.id,
        userId,
        role: 'OWNER',
      },
    });

    return { createdWorkspace, membership };
  });

  return res.status(201).json({
    workspace: {
      id: workspace.createdWorkspace.id,
      name: workspace.createdWorkspace.name,
      timezone: workspace.createdWorkspace.timezone,
      role: workspace.membership.role,
      createdAt: workspace.createdWorkspace.createdAt,
    },
  });
});

router.get('/workspaces/:id/members', requireUserAuth, async (req, res) => {
  const workspaceId = String(req.params.id);
  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'workspace:manage_members');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return res.json({
    members: members.map((member) => ({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      user: member.user,
    })),
  });
});

router.post('/workspaces/:id/members', requireUserAuth, async (req, res) => {
  const workspaceId = String(req.params.id);
  const parsed = upsertMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'workspace:manage_members');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }

  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const user = await prisma.user.findUnique({
    where: {
      email: parsed.data.email,
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found for provided email' });
  }

  const member = await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
    create: {
      workspaceId,
      userId: user.id,
      role: parsed.data.role,
    },
    update: {
      role: parsed.data.role,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      },
    },
  });

  return res.status(201).json({
    member: {
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      user: member.user,
    },
  });
});

export default router;

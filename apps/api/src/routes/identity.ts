import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  generateRawScimToken,
  getKeyPrefix,
  hashPassword,
  hashScopedToken,
  signUserToken,
  verifySsoSignature,
} from '../lib/crypto.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const providerSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  issuer: z.string().url(),
  audience: z.string().min(2).max(255),
  domain: z.string().min(3).max(255).optional().nullable(),
  sharedSecret: z.string().min(8).max(512),
  jitEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
});

const providerPatchSchema = providerSchema.partial().omit({ workspaceId: true });

const scimTokenCreateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  description: z.string().max(255).optional().nullable(),
});

const ssoLoginSchema = z.object({
  workspaceId: z.string().uuid(),
  issuer: z.string().url(),
  audience: z.string().min(2).max(255),
  email: z.string().email().transform((value) => value.toLowerCase()),
  signature: z.string().min(32).max(256),
});

const scimUserCreateSchema = z.object({
  userName: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(['OWNER', 'MEMBER']).optional(),
  active: z.boolean().optional(),
});

const scimUserPatchSchema = z.object({
  role: z.enum(['OWNER', 'MEMBER']).optional(),
  active: z.boolean().optional(),
});

const sanitizeProvider = (provider: {
  id: string;
  workspaceId: string;
  name: string;
  issuer: string;
  audience: string;
  domain: string | null;
  jitEnabled: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...provider,
});

const requireScimAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing SCIM bearer token' });
  }

  const rawToken = authHeader.slice('Bearer '.length);
  const tokenHash = hashScopedToken('scim', rawToken);

  const tokenRecord = await prisma.workspaceScimToken.findUnique({
    where: {
      tokenHash,
    },
    select: {
      id: true,
      workspaceId: true,
      revokedAt: true,
    },
  });

  if (!tokenRecord || tokenRecord.revokedAt) {
    return res.status(401).json({ error: 'Invalid SCIM token' });
  }

  await prisma.workspaceScimToken.update({
    where: {
      id: tokenRecord.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  req.scim = {
    workspaceId: tokenRecord.workspaceId,
    tokenId: tokenRecord.id,
  };

  return next();
};

router.get('/sso/providers', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'identity:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const providers = await prisma.workspaceIdentityProvider.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return res.json({
    providers: providers.map(sanitizeProvider),
  });
});

router.post('/sso/providers', requireUserAuth, async (req, res) => {
  const parsed = providerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'identity:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const provider = await prisma.workspaceIdentityProvider.create({
    data: {
      workspaceId,
      name: parsed.data.name,
      issuer: parsed.data.issuer,
      audience: parsed.data.audience,
      domain: parsed.data.domain ?? null,
      sharedSecret: parsed.data.sharedSecret,
      jitEnabled: parsed.data.jitEnabled ?? true,
      active: parsed.data.active ?? true,
    },
  });

  return res.status(201).json({ provider: sanitizeProvider(provider) });
});

router.patch('/sso/providers/:id', requireUserAuth, async (req, res) => {
  const providerId = String(req.params.id);
  const parsed = providerPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.workspaceIdentityProvider.findUnique({
    where: {
      id: providerId,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'identity:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const provider = await prisma.workspaceIdentityProvider.update({
    where: {
      id: existing.id,
    },
    data: {
      name: parsed.data.name,
      issuer: parsed.data.issuer,
      audience: parsed.data.audience,
      domain: parsed.data.domain === undefined ? undefined : (parsed.data.domain ?? null),
      sharedSecret: parsed.data.sharedSecret,
      jitEnabled: parsed.data.jitEnabled,
      active: parsed.data.active,
    },
  });

  return res.json({ provider: sanitizeProvider(provider) });
});

router.delete('/sso/providers/:id', requireUserAuth, async (req, res) => {
  const providerId = String(req.params.id);
  const existing = await prisma.workspaceIdentityProvider.findUnique({
    where: {
      id: providerId,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, existing.workspaceId, 'identity:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  await prisma.workspaceIdentityProvider.delete({
    where: {
      id: providerId,
    },
  });

  return res.status(204).send();
});

router.post('/auth/sso/login', async (req, res) => {
  const parsed = ssoLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const provider = await prisma.workspaceIdentityProvider.findFirst({
    where: {
      workspaceId: parsed.data.workspaceId,
      issuer: parsed.data.issuer,
      audience: parsed.data.audience,
      active: true,
    },
  });

  if (!provider) {
    return res.status(404).json({ error: 'No active identity provider match' });
  }

  if (provider.domain && !parsed.data.email.endsWith(`@${provider.domain.toLowerCase()}`)) {
    return res.status(403).json({ error: 'Email domain not allowed by identity provider' });
  }

  const signaturePayload = `${parsed.data.workspaceId}:${parsed.data.issuer}:${parsed.data.audience}:${parsed.data.email}`;
  const validSignature = verifySsoSignature(
    signaturePayload,
    parsed.data.signature,
    provider.sharedSecret,
  );

  if (!validSignature) {
    return res.status(401).json({ error: 'Invalid SSO signature' });
  }

  const user =
    (await prisma.user.findUnique({
      where: {
        email: parsed.data.email,
      },
    })) ??
    (await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash: await hashPassword(randomBytes(24).toString('hex')),
      },
    }));

  let membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
      },
    },
  });

  if (!membership && provider.jitEnabled) {
    membership = await prisma.workspaceMember.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
        role: 'MEMBER',
      },
    });
  }

  if (!membership) {
    return res.status(403).json({ error: 'User is not a workspace member and JIT is disabled' });
  }

  const workspace = await prisma.workspace.findUnique({
    where: {
      id: parsed.data.workspaceId,
    },
  });

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const token = signUserToken({ sub: user.id, email: user.email });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      authMode: 'SSO',
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      timezone: workspace.timezone,
      role: membership.role,
    },
  });
});

router.get('/scim/tokens', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'identity:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const tokens = await prisma.workspaceScimToken.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      tokenPrefix: true,
      description: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return res.json({ tokens });
});

router.post('/scim/tokens', requireUserAuth, async (req, res) => {
  const parsed = scimTokenCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'identity:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const rawToken = generateRawScimToken();
  const tokenHash = hashScopedToken('scim', rawToken);

  const token = await prisma.workspaceScimToken.create({
    data: {
      workspaceId,
      tokenHash,
      tokenPrefix: getKeyPrefix(rawToken),
      description: parsed.data.description ?? null,
      createdByUserId: req.user!.id,
    },
    select: {
      id: true,
      tokenPrefix: true,
      description: true,
      createdAt: true,
    },
  });

  return res.status(201).json({
    token: {
      ...token,
      rawToken,
    },
    note: 'Store this SCIM token now. It will not be shown again.',
  });
});

router.delete('/scim/tokens/:id', requireUserAuth, async (req, res) => {
  const tokenId = String(req.params.id);
  const token = await prisma.workspaceScimToken.findUnique({
    where: {
      id: tokenId,
    },
  });

  if (!token) {
    return res.status(404).json({ error: 'SCIM token not found' });
  }

  const access = await assertWorkspacePermission(req.user!.id, token.workspaceId, 'identity:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  await prisma.workspaceScimToken.update({
    where: {
      id: token.id,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return res.status(204).send();
});

router.get('/scim/v2/Users', requireScimAuth, async (req, res) => {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: req.scim!.workspaceId,
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
    Resources: members.map((member) => ({
      id: member.user.id,
      userName: member.user.email,
      active: true,
      role: member.role,
      meta: {
        created: member.user.createdAt.toISOString(),
      },
    })),
    totalResults: members.length,
    startIndex: 1,
    itemsPerPage: members.length,
  });
});

router.post('/scim/v2/Users', requireScimAuth, async (req, res) => {
  const parsed = scimUserCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const created = await prisma.$transaction(async (tx: any) => {
    const user =
      (await tx.user.findUnique({
        where: {
          email: parsed.data.userName,
        },
      })) ??
      (await tx.user.create({
        data: {
          email: parsed.data.userName,
          passwordHash: await hashPassword(randomBytes(24).toString('hex')),
        },
      }));

    if (parsed.data.active === false) {
      return { user, role: null };
    }

    const membership = await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: req.scim!.workspaceId,
          userId: user.id,
        },
      },
      create: {
        workspaceId: req.scim!.workspaceId,
        userId: user.id,
        role: parsed.data.role ?? 'MEMBER',
      },
      update: {
        role: parsed.data.role ?? undefined,
      },
    });

    return { user, role: membership.role };
  });

  return res.status(201).json({
    id: created.user.id,
    userName: created.user.email,
    active: parsed.data.active !== false,
    role: created.role ?? null,
  });
});

router.patch('/scim/v2/Users/:id', requireScimAuth, async (req, res) => {
  const userId = String(req.params.id);
  const parsed = scimUserPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (parsed.data.active === false) {
    await prisma.workspaceMember.deleteMany({
      where: {
        workspaceId: req.scim!.workspaceId,
        userId,
      },
    });

    return res.json({
      id: user.id,
      userName: user.email,
      active: false,
    });
  }

  const member = await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: req.scim!.workspaceId,
        userId: user.id,
      },
    },
    create: {
      workspaceId: req.scim!.workspaceId,
      userId: user.id,
      role: parsed.data.role ?? 'MEMBER',
    },
    update: {
      role: parsed.data.role ?? undefined,
    },
  });

  return res.json({
    id: user.id,
    userName: user.email,
    active: true,
    role: member.role,
  });
});

router.delete('/scim/v2/Users/:id', requireScimAuth, async (req, res) => {
  const userId = String(req.params.id);

  await prisma.workspaceMember.deleteMany({
    where: {
      workspaceId: req.scim!.workspaceId,
      userId,
    },
  });

  return res.status(204).send();
});

export default router;

import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { appendAuditEvent } from '../lib/hashChain.js';
import { hashPassword, signUserToken, verifyPassword } from '../lib/crypto.js';

const router = Router();

const authSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const resolveClientIp = (req: Request): string | null => {
  const forwardedFor = req.header('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  return req.ip ?? null;
};

const toAuthMetadata = (
  req: Request,
  userId: string,
  email: string,
  outcome: 'success' | 'failed',
): Record<string, unknown> => ({
  user_id: userId,
  email,
  auth_mode: 'password',
  outcome,
  ip_address: resolveClientIp(req),
  user_agent: req.header('user-agent') ?? null,
});

const logAuthEvent = async (params: {
  workspaceIds: string[];
  req: Request;
  userId: string;
  email: string;
  action: 'signup' | 'login_success' | 'login_failed';
  decision: 'ALLOW' | 'BLOCK';
  reason: string;
}) => {
  if (params.workspaceIds.length === 0) {
    return;
  }

  const workspaceIds = [...new Set(params.workspaceIds)];
  const metadata = toAuthMetadata(
    params.req,
    params.userId,
    params.email,
    params.decision === 'ALLOW' ? 'success' : 'failed',
  );

  const writes = await Promise.allSettled(
    workspaceIds.map((workspaceId) =>
      appendAuditEvent(prisma, {
        workspaceId,
        tool: 'auth',
        action: params.action,
        decision: params.decision,
        reason: params.reason,
        metadata,
      }),
    ),
  );

  for (const write of writes) {
    if (write.status === 'rejected') {
      console.error('Failed to write auth audit event', write.reason);
    }
  }
};

router.post('/auth/signup', async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);

    const created = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: `${email.split('@')[0]} Workspace`,
          timezone: 'Asia/Kolkata',
        },
      });

      const membership = await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'OWNER',
        },
      });

      return { user, workspace, membership };
    });

    const token = signUserToken({ sub: created.user.id, email: created.user.email });

    void logAuthEvent({
      workspaceIds: [created.workspace.id],
      req,
      userId: created.user.id,
      email: created.user.email,
      action: 'signup',
      decision: 'ALLOW',
      reason: 'user_registered',
    });

    return res.status(201).json({
      token,
      user: {
        id: created.user.id,
        email: created.user.email,
        createdAt: created.user.createdAt,
      },
      defaultWorkspace: {
        id: created.workspace.id,
        name: created.workspace.name,
        timezone: created.workspace.timezone,
        role: created.membership.role,
        createdAt: created.workspace.createdAt,
      },
    });
  } catch {
    return res.status(500).json({ error: 'Unable to complete signup' });
  }
});

router.post('/auth/login', async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId: user.id,
    },
    select: {
      workspaceId: true,
    },
  });
  const workspaceIds = memberships.map((membership) => membership.workspaceId);

  if (!passwordValid) {
    void logAuthEvent({
      workspaceIds,
      req,
      userId: user.id,
      email: user.email,
      action: 'login_failed',
      decision: 'BLOCK',
      reason: 'invalid_credentials',
    });

    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signUserToken({ sub: user.id, email: user.email });

  void logAuthEvent({
    workspaceIds,
    req,
    userId: user.id,
    email: user.email,
    action: 'login_success',
    decision: 'ALLOW',
    reason: 'credentials_valid',
  });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    },
  });
});

export default router;

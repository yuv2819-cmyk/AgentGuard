import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, signUserToken, verifyPassword } from '../lib/crypto.js';

const router = Router();

const authSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

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
  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signUserToken({ sub: user.id, email: user.email });

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

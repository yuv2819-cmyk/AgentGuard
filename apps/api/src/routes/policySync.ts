import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { normalizePolicyRules } from '../lib/policyEngine.js';
import { assertWorkspacePermission, resolveWorkspaceId } from '../lib/workspace.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

const policyRulesSchema = z.object({
  mode: z.enum(['STRICT', 'BALANCED']).optional(),
  allow_actions: z.array(z.string()).optional(),
  deny_actions: z.array(z.string()).optional(),
  allow_tools: z.array(z.string()).optional(),
  deny_tools: z.array(z.string()).optional(),
  require_approval_actions: z.array(z.string()).optional(),
});

const configSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  provider: z.string().min(2).max(30).default('github'),
  repoUrl: z.string().url(),
  branch: z.string().min(1).max(100).default('main'),
  path: z.string().min(1).max(255).default('policies'),
  active: z.boolean().optional(),
});

const syncPolicySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  mode: z.enum(['STRICT', 'BALANCED']).optional(),
  rules: policyRulesSchema,
  changeSummary: z.string().max(255).optional(),
});

const syncRequestSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  commitSha: z.string().max(120).optional().nullable(),
  summary: z.string().max(500).optional().nullable(),
  policies: z.array(syncPolicySchema).min(1).max(200),
});

router.get('/policy-sync/config', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'policy_sync:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const config = await prisma.policyGitSyncConfig.findUnique({
    where: {
      workspaceId,
    },
  });

  return res.json({ config });
});

router.put('/policy-sync/config', requireUserAuth, async (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'policy_sync:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const config = await prisma.policyGitSyncConfig.upsert({
    where: {
      workspaceId,
    },
    create: {
      workspaceId,
      provider: parsed.data.provider,
      repoUrl: parsed.data.repoUrl,
      branch: parsed.data.branch,
      path: parsed.data.path,
      active: parsed.data.active ?? true,
    },
    update: {
      provider: parsed.data.provider,
      repoUrl: parsed.data.repoUrl,
      branch: parsed.data.branch,
      path: parsed.data.path,
      active: parsed.data.active ?? true,
    },
  });

  return res.status(201).json({ config });
});

router.get('/policy-sync/runs', requireUserAuth, async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'policy_sync:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const runs = await prisma.policySyncRun.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  });

  return res.json({ runs });
});

router.post('/policy-sync/sync', requireUserAuth, async (req, res) => {
  const parsed = syncRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const workspaceId = parsed.data.workspaceId ?? resolveWorkspaceId(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const access = await assertWorkspacePermission(req.user!.id, workspaceId, 'policy_sync:manage');
  if (!access) {
    return res.status(403).json({ error: 'Workspace access denied' });
  }
  if (!access.authorized) {
    return res.status(403).json({ error: 'Insufficient role permissions' });
  }

  const commitSha = parsed.data.commitSha ?? null;
  let importedCount = 0;

  await prisma.$transaction(async (tx: any) => {
    for (const policyInput of parsed.data.policies) {
      const existing = await tx.policy.findFirst({
        where: {
          workspaceId,
          name: policyInput.name,
        },
      });

      const mode = policyInput.mode ?? existing?.mode ?? 'BALANCED';
      const normalizedRules = normalizePolicyRules(
        {
          ...policyInput.rules,
          mode,
        },
        mode,
      );

      const nextVersion = existing ? existing.version + 1 : 1;

      const policy = existing
        ? await tx.policy.update({
            where: { id: existing.id },
            data: {
              description: policyInput.description ?? null,
              mode,
              rules: normalizedRules as any,
              version: nextVersion,
              status: 'DRAFT',
              syncSource: commitSha,
              submittedByUserId: null,
              submittedAt: null,
              approvedByUserId: null,
              approvedAt: null,
              rejectionReason: null,
            },
          })
        : await tx.policy.create({
            data: {
              workspaceId,
              name: policyInput.name,
              description: policyInput.description ?? null,
              mode,
              rules: normalizedRules as any,
              version: nextVersion,
              status: 'DRAFT',
              syncSource: commitSha,
            },
          });

      await tx.policyVersion.create({
        data: {
          policyId: policy.id,
          version: policy.version,
          mode: policy.mode,
          rules: policy.rules as any,
          changeSummary: policyInput.changeSummary ?? `Synced from ${commitSha ?? 'manual import'}`,
          createdByUserId: req.user!.id,
        },
      });

      importedCount += 1;
    }

    await tx.policySyncRun.create({
      data: {
        workspaceId,
        commitSha,
        importedCount,
        summary: parsed.data.summary ?? `Imported ${importedCount} policy file(s)`,
        createdByUserId: req.user!.id,
      },
    });

    await tx.policyGitSyncConfig.updateMany({
      where: {
        workspaceId,
      },
      data: {
        lastSyncedCommit: commitSha,
        lastSyncedAt: new Date(),
      },
    });
  });

  return res.status(201).json({
    importedCount,
    commitSha,
    summary: parsed.data.summary ?? `Imported ${importedCount} policy file(s)`,
  });
});

export default router;

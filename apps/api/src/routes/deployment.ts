import { Router } from 'express';
import { env } from '../config.js';
import { requireUserAuth } from '../middleware/auth.js';

const router = Router();

router.get('/deployment/profile', requireUserAuth, (_req, res) => {
  const privateMode = env.PRIVATE_DEPLOYMENT_MODE === 'true';

  return res.json({
    region: env.DEPLOY_REGION,
    privateDeploymentMode: privateMode,
    topology: privateMode ? 'single-tenant-private' : 'multi-tenant-saas',
    recommendations: [
      'Pin API and DB to same region for low audit-ingest latency',
      'Enable VPC peering/private link in private deployment mode',
      'Run read replicas in secondary region for forensic read workloads',
    ],
  });
});

export default router;

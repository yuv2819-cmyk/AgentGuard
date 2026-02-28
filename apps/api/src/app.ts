import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config.js';
import agentActionsRouter from './routes/agentActions.js';
import agentsRouter from './routes/agents.js';
import approvalsRouter from './routes/approvals.js';
import auditLogsRouter from './routes/auditLogs.js';
import authRouter from './routes/auth.js';
import complianceRouter from './routes/compliance.js';
import deploymentRouter from './routes/deployment.js';
import forensicsRouter from './routes/forensics.js';
import healthRouter from './routes/health.js';
import identityRouter from './routes/identity.js';
import integrationsRouter from './routes/integrations.js';
import playbooksRouter from './routes/playbooks.js';
import policySyncRouter from './routes/policySync.js';
import policiesRouter from './routes/policies.js';
import rbacRouter from './routes/rbac.js';
import runtimeRouter from './routes/runtime.js';
import simulateRouter from './routes/simulate.js';
import trustCenterRouter from './routes/trustCenter.js';
import workspacesRouter from './routes/workspaces.js';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(express.json({ limit: '1mb' }));

  app.use('/v1', healthRouter);
  app.use('/v1', authRouter);
  app.use('/v1', identityRouter);
  app.use('/v1', workspacesRouter);
  app.use('/v1', rbacRouter);
  app.use('/v1', agentsRouter);
  app.use('/v1', policiesRouter);
  app.use('/v1', policySyncRouter);
  app.use('/v1', simulateRouter);
  app.use('/v1', agentActionsRouter);
  app.use('/v1', runtimeRouter);
  app.use('/v1', auditLogsRouter);
  app.use('/v1', forensicsRouter);
  app.use('/v1', approvalsRouter);
  app.use('/v1', playbooksRouter);
  app.use('/v1', integrationsRouter);
  app.use('/v1', complianceRouter);
  app.use('/v1', trustCenterRouter);
  app.use('/v1', deploymentRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

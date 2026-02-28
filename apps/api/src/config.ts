import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  AGENT_KEY_SALT: z.string().min(8),
  APPROVAL_SIGNING_SECRET: z.string().min(16).default('approval_signing_secret_dev_value'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  DEPLOY_REGION: z.string().default('us-east-1'),
  PRIVATE_DEPLOYMENT_MODE: z.union([z.literal('true'), z.literal('false')]).default('false'),
});

export const env = envSchema.parse(process.env);

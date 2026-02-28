import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

export const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, 12);

export const verifyPassword = async (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const signUserToken = (payload: JwtPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });

export const verifyUserToken = (token: string): JwtPayload =>
  jwt.verify(token, env.JWT_SECRET) as JwtPayload;

export const generateRawAgentKey = (): string => `agk_${randomBytes(24).toString('hex')}`;

export const getKeyPrefix = (rawKey: string): string => rawKey.slice(0, 6);

export const hashAgentKey = (rawKey: string): string =>
  createHash('sha256').update(`${env.AGENT_KEY_SALT}:${rawKey}`).digest('hex');

export const hashScopedToken = (scope: string, rawToken: string): string =>
  createHash('sha256').update(`${scope}:${env.AGENT_KEY_SALT}:${rawToken}`).digest('hex');

export const generateRawScimToken = (): string => `scim_${randomBytes(32).toString('hex')}`;

export const signApprovalPayload = (payload: string): string =>
  createHash('sha256').update(`${env.APPROVAL_SIGNING_SECRET}:${payload}`).digest('hex');

export const verifySsoSignature = (payload: string, providedSignature: string, sharedSecret: string): boolean => {
  const expected = createHash('sha256').update(`${payload}:${sharedSecret}`).digest('hex');
  return expected === providedSignature;
};

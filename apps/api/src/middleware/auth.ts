import type { NextFunction, Request, Response } from 'express';
import { verifyUserToken } from '../lib/crypto.js';

export const requireUserAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyUserToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

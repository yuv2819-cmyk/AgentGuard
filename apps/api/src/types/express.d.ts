import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
      scim?: {
        workspaceId: string;
        tokenId: string;
      };
      workspaceId?: string;
      workspaceRole?: Role;
    }
  }
}

export {};

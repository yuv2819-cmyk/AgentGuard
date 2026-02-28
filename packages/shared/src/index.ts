export type Role = 'OWNER' | 'MEMBER';
export type AgentStatus = 'ACTIVE' | 'DISABLED';
export type PolicyMode = 'STRICT' | 'BALANCED';
export type Decision = 'ALLOW' | 'BLOCK';

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  timezone: string;
  role: Role;
  createdAt: string;
}

export interface PolicyRules {
  mode: PolicyMode;
  allow_actions: string[];
  deny_actions: string[];
  allow_tools: string[];
  deny_tools: string[];
  require_approval_actions?: string[];
}

export interface PolicyEvaluationContext {
  tool: string;
  action: string;
  resource?: string | null;
  metadata?: Record<string, unknown>;
  burstRate?: number;
}

export interface PolicyEvaluationResult {
  decision: Decision;
  reason: string;
  signals: string[];
}

export interface AgentActionPayload {
  tool: string;
  action: string;
  resource?: string | null;
  metadata?: Record<string, unknown>;
}

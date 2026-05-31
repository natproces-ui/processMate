// Types for Orchestration Module
// orchestration.ts
export interface Procedure {
  id: number;
  code: string;
  title: string;
  category: string;
  theme: string;
  versions: ProcedureVersion[];
  currentVersion: string;
  nextReviewDate: string;
}

export interface ProcedureVersion {
  version: string;
  status: 'validated' | 'validating' | 'pending' | 'archived';
  createdBy: string;
  createdAt: string;
  validators: string[];
  progress?: number;
  notes?: string;
}

export interface ValidationProcess {
  id: number;
  procedure: string;
  validator: string;
  status: 'validating' | 'pending_update' | 'validated';
  progress: number;
  startDate: string;
  daysSpent: number;
  approvalDate?: string;
  comments: ValidationComment[];
  issues: ValidationIssue[];
  requiredApprovals: RequiredApproval[];
}

export interface ValidationComment {
  date: string;
  author: string;
  text: string;
  type: 'comment' | 'response' | 'issue' | 'validated';
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  section: string;
  issue: string;
  resolution: string;
}

export interface RequiredApproval {
  role: string;
  person: string;
  status: 'approved' | 'in_progress' | 'pending' | 'blocked';
}

export interface EmailMessage {
  id: number;
  type: 'outgoing' | 'incoming';
  subject: string;
  date: string;
  status: 'sent' | 'received';
  procedure: string;
  body: string;
  to?: string | string[];
  from?: string;
  readAt?: string;
  responses?: number;
  attachments?: Attachment[];
  linkedComments?: LinkedComment[];
}

export interface Attachment {
  name: string;
  size: string;
}

export interface LinkedComment {
  date: string;
  text: string;
}

export interface TeamMember {
  id: number;
  name: string;
  role: string;
  validated: number;
  avgTime: number;
  accuracy: number;
  status: 'active' | 'absent';
}

export interface Bottleneck {
  id: number;
  name: string;
  blocker: string;
  daysSinceBlocked: number;
  severity: 'high' | 'medium' | 'low';
  procedures: string[];
}

export interface ProcessFlowStage {
  id: number;
  name: string;
  status: 'completed' | 'in_progress' | 'blocked' | 'pending';
  date: string | null;
  description: string;
  assignee: string;
  duration: string;
  progress?: number;
  blocker?: string;
}

export interface ProcessFlow {
  id: number;
  name: string;
  status: 'in_progress' | 'blocked' | 'completed';
  stages: ProcessFlowStage[];
}

export interface KPIMetric {
  title: string;
  value: number | string;
  change: number;
  color: string;
  iconColor: string;
}

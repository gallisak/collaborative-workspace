import { formatBytes } from '../attachments/attachment-rules.js';

export interface PlanCapacity {
  name: string;
  maxMembers: number | null;
  maxDocuments: number | null;
  maxStorageBytes: bigint | null;
}

export interface WorkspaceUsage {
  members: number;
  guestEditors: number;
  documents: number;
  storageBytes: bigint;
}

export function planMisfit(plan: PlanCapacity, usage: WorkspaceUsage): string | null {
  const seats = usage.members + usage.guestEditors;
  if (plan.maxMembers !== null && seats > plan.maxMembers) {
    return `The ${plan.name} plan allows up to ${plan.maxMembers} members, the workspace has ${seats} (guest editors included). Remove members or guest editors first.`;
  }
  if (plan.maxDocuments !== null && usage.documents > plan.maxDocuments) {
    return `The ${plan.name} plan allows up to ${plan.maxDocuments} documents, the workspace has ${usage.documents}. Delete documents first.`;
  }
  if (plan.maxStorageBytes !== null && usage.storageBytes > plan.maxStorageBytes) {
    return `The ${plan.name} plan includes ${formatBytes(plan.maxStorageBytes)} of storage, the workspace uses ${formatBytes(usage.storageBytes)}. Delete images first.`;
  }
  return null;
}

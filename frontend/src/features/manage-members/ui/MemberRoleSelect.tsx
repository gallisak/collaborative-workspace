'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { type AssignableRole, ROLE_LABELS } from '@/entities/workspace';
import type { WorkspaceRole } from '@/shared/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { changeMemberRole } from '../api/manage-members';

interface MemberRoleSelectProps {
  workspaceId: string;
  userId: string;
  name: string;
  role: WorkspaceRole;
  roles: readonly AssignableRole[];
}

export function MemberRoleSelect({
  workspaceId,
  userId,
  name,
  role,
  roles,
}: MemberRoleSelectProps) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          const result = await changeMemberRole(workspaceId, userId, next);
          if (result.error) {
            toast.error(result.error);
          }
        })
      }
    >
      <SelectTrigger size="sm" className="w-32" aria-label={`Role of ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((option) => (
          <SelectItem key={option} value={option}>
            {ROLE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

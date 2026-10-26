'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { z } from 'zod';
import { ASSIGNABLE_ROLES } from '@/entities/workspace';
import { routes } from '@/shared/config';
import { mutate } from '@/shared/dal';
import { idSchema } from '@/shared/lib';

const memberSchema = z.object({ workspaceId: idSchema, userId: idSchema });

export async function changeMemberRole(workspaceId: string, userId: string, role: string) {
  const parsed = memberSchema
    .extend({ role: z.enum(ASSIGNABLE_ROLES) })
    .parse({ workspaceId, userId, role });
  const result = await mutate((api) =>
    api.PATCH('/api/workspaces/{workspaceId}/members/{userId}', {
      params: { path: { workspaceId: parsed.workspaceId, userId: parsed.userId } },
      body: { role: parsed.role },
    }),
  );
  if (result.ok) {
    refresh();
  }
  return result.ok ? {} : { error: result.error };
}

export async function removeMember(workspaceId: string, userId: string) {
  const parsed = memberSchema.parse({ workspaceId, userId });
  const result = await mutate((api) =>
    api.DELETE('/api/workspaces/{workspaceId}/members/{userId}', {
      params: { path: parsed },
    }),
  );
  if (result.ok) {
    refresh();
  }
  return result.ok ? {} : { error: result.error };
}

export async function leaveWorkspace(workspaceId: string, userId: string) {
  const parsed = memberSchema.parse({ workspaceId, userId });
  const result = await mutate((api) =>
    api.DELETE('/api/workspaces/{workspaceId}/members/{userId}', {
      params: { path: parsed },
    }),
  );
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(routes.workspaces);
}

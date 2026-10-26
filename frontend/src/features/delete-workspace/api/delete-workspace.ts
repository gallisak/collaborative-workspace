'use server';

import { redirect } from 'next/navigation';
import { routes } from '@/shared/config';
import { mutate } from '@/shared/dal';
import { idSchema } from '@/shared/lib';

export async function deleteWorkspace(workspaceId: string) {
  const id = idSchema.parse(workspaceId);
  const result = await mutate((api) =>
    api.DELETE('/api/workspaces/{workspaceId}', { params: { path: { workspaceId: id } } }),
  );
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(routes.workspaces);
}

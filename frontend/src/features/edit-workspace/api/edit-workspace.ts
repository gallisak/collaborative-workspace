'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/shared/api';
import { mutate } from '@/shared/dal';
import { fieldErrors, idSchema, workspaceNameSchema } from '@/shared/lib';

const renameSchema = z.object({ workspaceId: idSchema, name: workspaceNameSchema });

export async function renameWorkspace(
  workspaceId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = renameSchema.safeParse({ workspaceId, name: formData.get('name') });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const result = await mutate((api) =>
    api.PATCH('/api/workspaces/{workspaceId}', {
      params: { path: { workspaceId: parsed.data.workspaceId } },
      body: { name: parsed.data.name },
    }),
  );
  if (!result.ok) {
    return { error: result.error };
  }
  refresh();
  return { success: 'Workspace renamed' };
}

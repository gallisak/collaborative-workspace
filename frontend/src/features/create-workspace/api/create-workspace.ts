'use server';

import { redirect } from 'next/navigation';
import type { FormState } from '@/shared/api';
import { mutate } from '@/shared/dal';
import { routes } from '@/shared/config';
import { fieldErrors, workspaceNameSchema } from '@/shared/lib';
import { z } from 'zod';

const schema = z.object({ name: workspaceNameSchema });

export async function createWorkspace(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const result = await mutate((api) => api.POST('/api/workspaces', { body: parsed.data }));
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(routes.workspace(result.data.id));
}

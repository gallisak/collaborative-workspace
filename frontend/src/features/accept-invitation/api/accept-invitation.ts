'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/shared/api';
import { mutate } from '@/shared/dal';
import { routes } from '@/shared/config';

export async function acceptInvitation(token: string): Promise<FormState> {
  const parsed = z.string().min(1).max(512).safeParse(token);
  if (!parsed.success) {
    return { error: 'This invitation link is not valid' };
  }
  const result = await mutate((api) =>
    api.POST('/api/invitations/accept', { body: { token: parsed.data } }),
  );
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(routes.workspace(result.data.workspaceId));
}

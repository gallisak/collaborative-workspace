'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { ASSIGNABLE_ROLES } from '@/entities/workspace';
import type { FormState } from '@/shared/api';
import { mutate } from '@/shared/dal';
import { emailSchema, fieldErrors, idSchema } from '@/shared/lib';

const inviteSchema = z.object({
  workspaceId: idSchema,
  email: emailSchema,
  role: z.enum(ASSIGNABLE_ROLES, 'Choose a role'),
});

export async function inviteMember(
  workspaceId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = inviteSchema.safeParse({
    workspaceId,
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const { email, role } = parsed.data;
  const result = await mutate((api) =>
    api.POST('/api/workspaces/{workspaceId}/invitations', {
      params: { path: { workspaceId: parsed.data.workspaceId } },
      body: { email, role },
    }),
  );
  if (!result.ok) {
    return { error: result.error };
  }
  refresh();
  return { success: `Invitation sent to ${email}` };
}

export async function revokeInvitation(workspaceId: string, invitationId: string) {
  const ids = z.object({ workspaceId: idSchema, invitationId: idSchema }).parse({
    workspaceId,
    invitationId,
  });
  const result = await mutate((api) =>
    api.DELETE('/api/workspaces/{workspaceId}/invitations/{invitationId}', {
      params: { path: ids },
    }),
  );
  if (result.ok) {
    refresh();
  }
  return result.ok ? {} : { error: result.error };
}

'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/shared/api';
import { mutate } from '@/shared/dal';
import { idSchema } from '@/shared/lib';
import { ACCESS_LEVELS, EXPIRY_VALUES, expiresAt } from '../model/share-options';

const createSchema = z.object({
  documentId: idSchema,
  accessLevel: z.enum(ACCESS_LEVELS, 'Choose who can do what'),
  expiry: z.enum(EXPIRY_VALUES, 'Choose when the link expires'),
});

export async function createShareLink(
  documentId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSchema.safeParse({
    documentId,
    accessLevel: formData.get('accessLevel'),
    expiry: formData.get('expiry'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
  const result = await mutate((api) =>
    api.POST('/api/documents/{documentId}/share-links', {
      params: { path: { documentId: parsed.data.documentId } },
      body: {
        accessLevel: parsed.data.accessLevel,
        expiresAt: expiresAt(parsed.data.expiry, Date.now()),
      },
    }),
  );
  if (!result.ok) {
    return { error: result.error };
  }
  refresh();
  return { success: 'Link created' };
}

export async function revokeShareLink(linkId: string) {
  const id = idSchema.parse(linkId);
  const result = await mutate((api) =>
    api.DELETE('/api/share-links/{linkId}', { params: { path: { linkId: id } } }),
  );
  if (result.ok) {
    refresh();
  }
  return result.ok ? {} : { error: result.error };
}

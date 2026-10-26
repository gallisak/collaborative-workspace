import { z } from 'zod';
import { publicBlocksSchema } from './blocks';

export const SHARE_TOKEN = /^[\w-]{32}$/;

export const publicDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  accessLevel: z.enum(['VIEW', 'EDIT']),
  blocks: publicBlocksSchema,
});

export type PublicDocument = z.infer<typeof publicDocumentSchema>;

export const publicDocumentTag = (documentId: string) => `public-document:${documentId}`;

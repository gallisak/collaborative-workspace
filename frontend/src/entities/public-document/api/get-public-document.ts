import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { ApiError } from '@/shared/api';
import { publicApi } from '@/shared/dal';
import {
  type PublicDocument,
  publicDocumentSchema,
  publicDocumentTag,
  SHARE_TOKEN,
} from '../model/public-document';

export async function getPublicDocument(token: string): Promise<PublicDocument | null> {
  'use cache';
  if (!SHARE_TOKEN.test(token)) {
    cacheLife('max');
    return null;
  }
  const { data, error, response } = await publicApi.GET('/api/public/documents/{token}', {
    params: { path: { token } },
  });
  if (response.status === 404) {
    cacheLife('minutes');
    return null;
  }
  if (!response.ok) {
    throw ApiError.from(response.status, error);
  }
  const document = publicDocumentSchema.parse(data);
  cacheLife('days');
  cacheTag(publicDocumentTag(document.id));
  return document;
}

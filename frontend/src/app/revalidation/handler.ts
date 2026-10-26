import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { publicDocumentTag } from '@/entities/public-document';
import { idSchema } from '@/shared/lib';

const BEARER = 'Bearer ';
const bodySchema = z.object({ documentId: idSchema });

function matches(header: string | null, secret: string) {
  if (!header?.startsWith(BEARER)) {
    return false;
  }
  const provided = Buffer.from(header.slice(BEARER.length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function createRevalidateHandler(secret: string | undefined) {
  return async function POST(request: Request) {
    if (!secret || !matches(request.headers.get('authorization'), secret)) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return Response.json({ message: 'Expected a document id' }, { status: 400 });
    }
    revalidateTag(publicDocumentTag(body.data.documentId), { expire: 0 });
    return new Response(null, { status: 204 });
  };
}

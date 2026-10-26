import { api, unwrap } from '@/shared/api';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const isImageType = (type: string): type is ImageType =>
  (IMAGE_TYPES as readonly string[]).includes(type);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class UploadError extends Error {}

export function checkImage(file: File): string | null {
  if (!isImageType(file.type)) {
    return 'Choose a PNG, JPEG, GIF or WebP image';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Images can be up to 10 MB';
  }
  return null;
}

export async function uploadImage(documentId: string, file: File) {
  const problem = checkImage(file);
  if (problem || !isImageType(file.type)) {
    throw new UploadError(problem ?? 'Choose an image');
  }
  const { attachment, upload } = unwrap(
    await api.POST('/api/documents/{documentId}/attachments', {
      params: { path: { documentId } },
      body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
    }),
  );
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) {
    form.append(key, value);
  }
  form.append('file', file);
  const stored = await fetch(upload.url, { method: 'POST', body: form }).catch(() => null);
  if (!stored?.ok) {
    throw new UploadError('The image could not be uploaded, please try again');
  }
  unwrap(
    await api.POST('/api/attachments/{attachmentId}/complete', {
      params: { path: { attachmentId: attachment.id } },
    }),
  );
  return { src: attachment.url, alt: file.name };
}

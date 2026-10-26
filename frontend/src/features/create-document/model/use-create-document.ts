'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useDocumentTree } from '@/entities/document';
import { toast } from 'sonner';
import { ApiError, api, unwrap } from '@/shared/api';
import { routes } from '@/shared/config';
import { notifyError } from '@/shared/lib';

export function useCreateDocument(onCreated?: (parentId: string | null) => void) {
  const router = useRouter();
  const { workspaceId, reload } = useDocumentTree();
  const [creating, setCreating] = useState(false);

  const create = async (parentId: string | null = null) => {
    setCreating(true);
    try {
      const document = unwrap(
        await api.POST('/api/workspaces/{workspaceId}/documents', {
          params: { path: { workspaceId } },
          body: parentId ? { parentId } : {},
        }),
      );
      await reload();
      onCreated?.(parentId);
      router.push(routes.document(workspaceId, document.id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        toast.error(error.message, {
          action: {
            label: 'View plans',
            onClick: () => router.push(routes.workspaceBilling(workspaceId)),
          },
        });
      } else {
        notifyError(error);
      }
    } finally {
      setCreating(false);
    }
  };

  return { create, creating };
}

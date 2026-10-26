'use client';

import { isNoopMove, moveNode, type Placement, useDocumentTree } from '@/entities/document';
import { api, unwrap } from '@/shared/api';
import { notifyError } from '@/shared/lib';

export function useMoveDocument() {
  const { nodes, setNodes, reload } = useDocumentTree();

  return async (documentId: string, placement: Placement) => {
    if (isNoopMove(nodes, documentId, placement)) {
      return;
    }
    const previous = nodes;
    setNodes((current) => moveNode(current, documentId, placement));
    try {
      unwrap(
        await api.POST('/api/documents/{documentId}/move', {
          params: { path: { documentId } },
          body: placement,
        }),
      );
      await reload();
    } catch (error) {
      setNodes(() => previous);
      notifyError(error);
    }
  };
}

'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { api, type DocumentNode, unwrap } from '@/shared/api';
import { notifyError } from '@/shared/lib';

interface DocumentTreeValue {
  workspaceId: string;
  nodes: DocumentNode[];
  setNodes: (update: (nodes: DocumentNode[]) => DocumentNode[]) => void;
  reload: () => Promise<void>;
  renameLocally: (id: string, title: string) => void;
}

const DocumentTreeContext = createContext<DocumentTreeValue | null>(null);

interface DocumentTreeProviderProps {
  workspaceId: string;
  initialNodes: DocumentNode[];
  children: ReactNode;
}

export function DocumentTreeProvider({
  workspaceId,
  initialNodes,
  children,
}: DocumentTreeProviderProps) {
  const [nodes, setNodes] = useState(initialNodes);

  const reload = useCallback(async () => {
    try {
      const fresh = unwrap(
        await api.GET('/api/workspaces/{workspaceId}/documents', {
          params: { path: { workspaceId } },
        }),
      );
      setNodes(fresh);
    } catch (error) {
      notifyError(error);
    }
  }, [workspaceId]);

  const renameLocally = useCallback((id: string, title: string) => {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, title } : node)));
  }, []);

  const value = useMemo(
    () => ({ workspaceId, nodes, setNodes, reload, renameLocally }),
    [workspaceId, nodes, reload, renameLocally],
  );

  return <DocumentTreeContext value={value}>{children}</DocumentTreeContext>;
}

export function useDocumentTree() {
  const value = useContext(DocumentTreeContext);
  if (!value) {
    throw new Error('useDocumentTree must be used inside DocumentTreeProvider');
  }
  return value;
}

export function useOptionalDocumentTree() {
  return useContext(DocumentTreeContext);
}

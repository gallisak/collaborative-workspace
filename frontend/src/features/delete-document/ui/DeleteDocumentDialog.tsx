'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { descendantsOf, displayTitle, useDocumentTree } from '@/entities/document';
import { api, unwrap } from '@/shared/api';
import { routes } from '@/shared/config';
import { notifyError } from '@/shared/lib';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';

interface DeleteDocumentDialogProps {
  documentId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteDocumentDialog({ documentId, onOpenChange }: DeleteDocumentDialogProps) {
  const router = useRouter();
  const params = useParams<{ documentId?: string }>();
  const { workspaceId, nodes, reload } = useDocumentTree();
  const [deleting, setDeleting] = useState(false);
  const document = nodes.find((node) => node.id === documentId);
  const subpages = documentId ? descendantsOf(nodes, documentId).size : 0;

  const remove = async () => {
    if (!documentId) {
      return;
    }
    setDeleting(true);
    try {
      unwrap(
        await api.DELETE('/api/documents/{documentId}', {
          params: { path: { documentId } },
        }),
      );
      const current = params?.documentId;
      const removed = new Set([documentId, ...descendantsOf(nodes, documentId)]);
      await reload();
      onOpenChange(false);
      if (current && removed.has(current)) {
        router.push(routes.workspace(workspaceId));
      }
    } catch (error) {
      notifyError(error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={documentId !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{displayTitle(document?.title ?? '')}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {subpages > 0
              ? `The page and its ${subpages} subpage${subpages === 1 ? '' : 's'} will be deleted for everyone.`
              : 'The page will be deleted for everyone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>
            {deleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

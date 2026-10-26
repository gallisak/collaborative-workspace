'use client';

import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { displayTitle, useDocumentTree } from '@/entities/document';
import { useCreateDocument } from '@/features/create-document';
import { routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';

export function RootPages({ editable }: { editable: boolean }) {
  const { workspaceId, nodes } = useDocumentTree();
  const { create, creating } = useCreateDocument();
  const roots = nodes
    .filter((node) => node.parentId === null)
    .sort((a, b) => (a.position < b.position ? -1 : 1));

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Pages</h2>
        {editable && (
          <Button size="sm" disabled={creating} onClick={() => create(null)}>
            <Plus />
            New page
          </Button>
        )}
      </div>
      {roots.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {editable ? 'No pages yet. Create the first one.' : 'No pages yet.'}
        </p>
      ) : (
        <ul className="grid gap-1">
          {roots.map((node) => (
            <li key={node.id}>
              <Link
                href={routes.document(workspaceId, node.id)}
                className="hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2 text-sm"
              >
                <FileText className="text-muted-foreground size-4" />
                {displayTitle(node.title)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

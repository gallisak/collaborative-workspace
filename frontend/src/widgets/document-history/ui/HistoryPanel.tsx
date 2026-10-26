'use client';

import { History, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, unwrap, type Version } from '@/shared/api';
import { cn, notifyError, relativeTime } from '@/shared/lib';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useVersions } from '../model/use-versions';
import { VersionPreview } from './VersionPreview';

interface HistoryPanelProps {
  documentId: string;
  canEdit: boolean;
  onClose: () => void;
}

const versionLabel = (version: Version) =>
  version.name ?? (version.kind === 'AUTO' ? 'Automatic snapshot' : 'Saved version');

export function HistoryPanel({ documentId, canEdit, onClose }: HistoryPanelProps) {
  const { versions, waitForNew } = useVersions(documentId);
  const [selected, setSelected] = useState<{ id: string; state: string } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      unwrap(
        await api.POST('/api/documents/{documentId}/versions', {
          params: { path: { documentId } },
          body: name.trim() ? { name: name.trim() } : {},
        }),
      );
      setName('');
      await waitForNew(versions?.length ?? 0);
      toast.success('Version saved');
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  const open = async (versionId: string) => {
    try {
      const details = unwrap(
        await api.GET('/api/documents/{documentId}/versions/{versionId}', {
          params: { path: { documentId, versionId } },
        }),
      );
      setSelected({ id: details.id, state: details.state });
    } catch (error) {
      notifyError(error);
    }
  };

  const restore = async (versionId: string) => {
    setBusy(true);
    try {
      unwrap(
        await api.POST('/api/documents/{documentId}/versions/{versionId}/restore', {
          params: { path: { documentId, versionId } },
        }),
      );
      setSelected(null);
      await waitForNew(versions?.length ?? 0);
      toast.success('Version restored for everyone');
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Version history" className="grid content-start gap-3">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-medium">
          <History className="size-4" />
          Version history
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close history" onClick={onClose}>
          <X />
        </Button>
      </header>
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            aria-label="Version name"
            placeholder="Name (optional)"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy}>
            Save version
          </Button>
        </form>
      )}
      {versions === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : versions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No versions yet. Snapshots are taken automatically while people edit.
        </p>
      ) : (
        <ul className="grid gap-1">
          {versions.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                aria-pressed={selected?.id === version.id}
                className={cn(
                  'hover:bg-accent grid w-full rounded-md px-3 py-2 text-left',
                  selected?.id === version.id && 'bg-accent',
                )}
                onClick={() => void open(version.id)}
              >
                <span className="truncate text-sm font-medium">{versionLabel(version)}</span>
                <span className="text-muted-foreground text-xs">
                  {relativeTime(version.createdAt)}
                  {version.createdBy ? ` · ${version.createdBy.name}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="grid gap-3 rounded-lg border p-3">
          <div className="max-h-96 overflow-y-auto">
            <VersionPreview key={selected.id} state={selected.state} />
          </div>
          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy}>
                  Restore this version
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restore this version?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The page is replaced for everyone. The current content is saved as a version
                    first, so you can go back.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void restore(selected.id)}>
                    Restore
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </section>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
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
import { deleteWorkspace } from '../api/delete-workspace';

export function DeleteWorkspaceButton({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await deleteWorkspace(workspaceId);
      if (result?.error) {
        toast.error(result.error);
      }
    });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setTyped('');
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete workspace</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Every page, comment, version, image and published link of the workspace is deleted for
            everyone. This cannot be undone. Type the name of the workspace to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          aria-label="Workspace name"
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || typed !== name}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {pending ? 'Deleting…' : 'Delete workspace'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
import { leaveWorkspace, removeMember } from '../api/manage-members';

interface RemoveMemberButtonProps {
  workspaceId: string;
  userId: string;
  name: string;
  self: boolean;
}

export function RemoveMemberButton({ workspaceId, userId, name, self }: RemoveMemberButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await (self ? leaveWorkspace : removeMember)(workspaceId, userId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
    });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={self ? 'Leave workspace' : `Remove ${name}`}>
          {self ? 'Leave' : 'Remove'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{self ? 'Leave this workspace?' : `Remove ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {self
              ? 'You lose access to its pages, including pages shared with you.'
              : 'They lose access to every page of the workspace, including pages shared with them.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {pending ? 'Removing…' : self ? 'Leave' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

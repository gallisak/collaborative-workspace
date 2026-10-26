'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import { renameWorkspace } from '../api/edit-workspace';

interface RenameWorkspaceFormProps {
  workspaceId: string;
  name: string;
  editable: boolean;
}

export function RenameWorkspaceForm({ workspaceId, name, editable }: RenameWorkspaceFormProps) {
  const [state, action, pending] = useActionState(
    renameWorkspace.bind(null, workspaceId),
    initialFormState,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <div className="min-w-64 flex-1">
        <FormField
          id="workspace-name"
          name="name"
          label="Name"
          defaultValue={name}
          maxLength={100}
          disabled={!editable}
          error={state.fieldErrors?.name ?? state.error}
        />
      </div>
      {editable && (
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      )}
      {state.success && (
        <p role="status" className="text-muted-foreground w-full text-sm">
          {state.success}
        </p>
      )}
    </form>
  );
}

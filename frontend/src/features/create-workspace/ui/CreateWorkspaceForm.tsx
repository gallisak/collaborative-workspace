'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/shared/api';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import { createWorkspace } from '../api/create-workspace';

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, initialFormState);
  return (
    <form action={action} className="grid gap-3" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FormField
        id="workspace-name"
        name="name"
        label="Workspace name"
        placeholder="Product team"
        maxLength={100}
        required
        error={state.fieldErrors?.name}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create workspace'}
      </Button>
    </form>
  );
}

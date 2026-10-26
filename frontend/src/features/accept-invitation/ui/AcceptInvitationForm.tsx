'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/shared/api';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { acceptInvitation } from '../api/accept-invitation';

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptInvitation.bind(null, token),
    initialFormState,
  );
  return (
    <form action={action} className="grid gap-3">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Joining…' : 'Join workspace'}
      </Button>
    </form>
  );
}

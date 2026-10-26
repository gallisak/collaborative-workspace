'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { type AssignableRole, ROLE_LABELS } from '@/entities/workspace';
import { initialFormState } from '@/shared/api';
import { routes } from '@/shared/config';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { inviteMember } from '../api/invite-member';

interface InviteMemberFormProps {
  workspaceId: string;
  roles: readonly AssignableRole[];
}

export function InviteMemberForm({ workspaceId, roles }: InviteMemberFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    inviteMember.bind(null, workspaceId),
    initialFormState,
  );

  useEffect(() => {
    if (state.success) {
      form.current?.reset();
    }
  }, [state]);

  return (
    <form ref={form} action={action} className="grid gap-3" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.error}
            {state.limitReached && (
              <Link href={routes.workspaceBilling(workspaceId)} className="font-medium underline">
                View plans
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <FormField
            id="invite-email"
            name="email"
            type="email"
            label="Email"
            placeholder="teammate@company.com"
            autoComplete="off"
            error={state.fieldErrors?.email}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select name="role" defaultValue={roles.includes('EDITOR') ? 'EDITOR' : roles[0]}>
            <SelectTrigger id="invite-role" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </div>
      {state.success && (
        <p role="status" className="text-muted-foreground text-sm">
          {state.success}
        </p>
      )}
    </form>
  );
}

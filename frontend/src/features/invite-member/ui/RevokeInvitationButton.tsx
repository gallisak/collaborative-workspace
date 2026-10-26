'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { revokeInvitation } from '../api/invite-member';

interface RevokeInvitationButtonProps {
  workspaceId: string;
  invitationId: string;
  email: string;
}

export function RevokeInvitationButton({
  workspaceId,
  invitationId,
  email,
}: RevokeInvitationButtonProps) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Revoke invitation for ${email}`}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeInvitation(workspaceId, invitationId);
          if (result.error) {
            toast.error(result.error);
          }
        })
      }
    >
      Revoke
    </Button>
  );
}

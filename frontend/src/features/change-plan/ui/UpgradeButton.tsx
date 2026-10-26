'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { startCheckout } from '../api/checkout';

interface UpgradeButtonProps {
  workspaceId: string;
  planId: string;
  planName: string;
}

export function UpgradeButton({ workspaceId, planId, planName }: UpgradeButtonProps) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startCheckout(workspaceId, planId);
          if (result?.error) {
            toast.error(result.error);
          }
        })
      }
    >
      {pending ? 'Opening checkout…' : `Switch to ${planName}`}
    </Button>
  );
}

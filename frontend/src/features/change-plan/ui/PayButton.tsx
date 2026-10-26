'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/shared/api';
import { routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { payCheckout } from '../api/checkout';

const POLL_INTERVAL_MS = 1000;
const POLL_ATTEMPTS = 30;

interface PayButtonProps {
  sessionId: string;
  workspaceId: string;
  amount: string;
  planName: string;
}

type Step = 'idle' | 'paying' | 'confirming';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = { kind: 'completed' } | { kind: 'failed'; reason: string } | { kind: 'pending' };

async function waitForOutcome(sessionId: string): Promise<Outcome> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await wait(POLL_INTERVAL_MS);
    const { data } = await api.GET('/api/billing/checkout-sessions/{sessionId}', {
      params: { path: { sessionId } },
    });
    if (data?.status === 'COMPLETED') {
      return { kind: 'completed' };
    }
    if (data?.status === 'FAILED') {
      return { kind: 'failed', reason: data.failureReason ?? 'The plan could not be changed' };
    }
  }
  return { kind: 'pending' };
}

export function PayButton({ sessionId, workspaceId, amount, planName }: PayButtonProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');

  const pay = async () => {
    setStep('paying');
    const result = await payCheckout(sessionId);
    if (result.error) {
      toast.error(result.error);
      setStep('idle');
      return;
    }
    setStep('confirming');
    const outcome = await waitForOutcome(sessionId);
    if (outcome.kind === 'failed') {
      toast.error(outcome.reason);
      router.refresh();
      return;
    }
    if (outcome.kind === 'completed') {
      toast.success(`The workspace is now on the ${planName} plan`);
    } else {
      toast.info('Payment received. The plan will switch in a moment.');
    }
    router.replace(routes.workspaceBilling(workspaceId));
  };

  return (
    <Button className="w-full" size="lg" disabled={step !== 'idle'} onClick={pay}>
      {step === 'idle' ? `Pay ${amount}` : step === 'paying' ? 'Paying…' : 'Confirming payment…'}
    </Button>
  );
}

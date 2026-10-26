'use client';

import { Button } from '@/shared/ui/button';
import { StatusScreen } from '@/shared/ui/status-screen';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <StatusScreen
      title="Something went wrong"
      description="The page could not be loaded. Try again in a moment."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

'use client';

import { catchError, type ErrorInfo } from 'next/error';
import { Button } from './button';

function SectionError({ title }: { title: string }, { retry }: ErrorInfo) {
  return (
    <div role="alert" className="grid justify-items-start gap-2 text-sm">
      <p className="text-muted-foreground">Could not load {title.toLowerCase()}.</p>
      <Button variant="outline" size="sm" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}

export const SectionBoundary = catchError(SectionError);

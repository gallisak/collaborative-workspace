'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { safeNextPath } from '@/shared/lib';

export const AUTH_SWITCH_LINK_CLASS = 'text-foreground underline underline-offset-4';

export function AuthSwitchLink({ to, children }: { to: string; children: ReactNode }) {
  const next = safeNextPath(useSearchParams()?.get('next'), '');
  return (
    <Link
      href={next ? `${to}?next=${encodeURIComponent(next)}` : to}
      className={AUTH_SWITCH_LINK_CLASS}
    >
      {children}
    </Link>
  );
}

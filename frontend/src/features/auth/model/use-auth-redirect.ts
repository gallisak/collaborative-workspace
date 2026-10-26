'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { safeNextPath } from '@/shared/lib';

export function useAuthRedirect() {
  const router = useRouter();
  const next = useSearchParams()?.get('next');
  return () => {
    router.replace(safeNextPath(next));
    router.refresh();
  };
}

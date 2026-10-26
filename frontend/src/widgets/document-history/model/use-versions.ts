'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, unwrap, type Version } from '@/shared/api';
import { notifyError } from '@/shared/lib';

const POLL_MS = 700;
const POLL_ATTEMPTS = 8;

export function useVersions(documentId: string) {
  const [versions, setVersions] = useState<Version[] | null>(null);

  const fetchVersions = useCallback(
    async () =>
      unwrap(
        await api.GET('/api/documents/{documentId}/versions', {
          params: { path: { documentId } },
        }),
      ),
    [documentId],
  );

  useEffect(() => {
    let active = true;
    fetchVersions().then(
      (fresh) => active && setVersions(fresh),
      (error: unknown) => active && notifyError(error),
    );
    return () => {
      active = false;
    };
  }, [fetchVersions]);

  const waitForNew = useCallback(
    async (known: number) => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const fresh = await fetchVersions();
        if (fresh.length > known) {
          setVersions(fresh);
          return;
        }
      }
    },
    [fetchVersions],
  );

  return { versions, waitForNew };
}

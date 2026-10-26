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
    async (known: readonly Version[] | null) => {
      const knownIds = new Set(known?.map((version) => version.id));
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const fresh = await fetchVersions();
        if (fresh.some((version) => version.kind === 'MANUAL' && !knownIds.has(version.id))) {
          setVersions(fresh);
          return true;
        }
      }
      return false;
    },
    [fetchVersions],
  );

  return { versions, waitForNew };
}

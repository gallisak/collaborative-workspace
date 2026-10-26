'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Thread } from '@/shared/api';

const POLL_MS = 15_000;

export function useThreads(documentId: string) {
  const [threads, setThreads] = useState<Thread[] | null>(null);

  const fetchThreads = useCallback(
    () =>
      api
        .GET('/api/documents/{documentId}/threads', { params: { path: { documentId } } })
        .then(({ data, response }) => (response.ok ? (data ?? []) : null)),
    [documentId],
  );

  const reload = useCallback(async () => {
    const fresh = await fetchThreads();
    if (fresh) {
      setThreads(fresh);
    }
  }, [fetchThreads]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void fetchThreads().then((fresh) => active && fresh && setThreads(fresh));
      }
    };
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchThreads]);

  return { threads, reload };
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/shared/api';

const POLL_MS = 30_000;

export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(
    () =>
      api
        .GET('/api/notifications/unread-count')
        .then(({ data, response }) => (response.ok && data ? data.count : null)),
    [],
  );

  const refresh = useCallback(async () => {
    const fresh = await fetchCount();
    if (fresh !== null) {
      setCount(fresh);
    }
  }, [fetchCount]);

  useEffect(() => {
    let active = true;
    const poll = () => {
      if (document.visibilityState === 'visible') {
        void fetchCount().then((fresh) => active && fresh !== null && setCount(fresh));
      }
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [fetchCount]);

  return { count, refresh };
}

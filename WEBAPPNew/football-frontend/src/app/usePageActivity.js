import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUserData } from '../Contexts/UserContext';

export default function usePageActivity() {
  const { pathname } = useLocation();
  const { hasSession, trackPageActivity } = useUserData();
  const path = useRef(pathname || '/');
  const started = useRef(Date.now());

  useEffect(() => {
    if (!hasSession) return;
    const now = Date.now();
    const durationSeconds = (now - started.current) / 1000;
    if (durationSeconds >= 1) trackPageActivity({ path: path.current, durationSeconds,
      startedAt: new Date(started.current).toISOString(), endedAt: new Date(now).toISOString() });
    path.current = pathname || '/';
    started.current = now;
  }, [hasSession, pathname, trackPageActivity]);

  useEffect(() => {
    if (!hasSession) return;
    const flush = () => {
      const now = Date.now();
      const durationSeconds = (now - started.current) / 1000;
      if (durationSeconds < 1) return;
      trackPageActivity({ path: path.current, durationSeconds,
        startedAt: new Date(started.current).toISOString(), endedAt: new Date(now).toISOString() });
      started.current = now;
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasSession, trackPageActivity]);
}

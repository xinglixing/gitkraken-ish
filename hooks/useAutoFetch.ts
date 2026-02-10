import { useState, useEffect, useCallback, useRef } from 'react';
import { Repository, AIConfig } from '../types';
import { gitFetch } from '../services/localGitService';

interface UseAutoFetchOptions {
  repo: Repository | null;
  config: AIConfig;
  token: string | null;
  onFetchComplete?: () => void;
}

interface UseAutoFetchReturn {
  isFetching: boolean;
  setIsFetching: (value: boolean) => void;
  lastFetchTime: Date | null;
  setLastFetchTime: (value: Date | null) => void;
  fetchNow: () => Promise<void>;
}

export function useAutoFetch({ repo, config, token, onFetchComplete }: UseAutoFetchOptions): UseAutoFetchReturn {
  const [isFetching, setIsFetching] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);
  const onFetchCompleteRef = useRef(onFetchComplete);
  onFetchCompleteRef.current = onFetchComplete;

  const fetchNow = useCallback(async () => {
    if (!repo?.isLocal || isFetchingRef.current) return;

    isFetchingRef.current = true;
    setIsFetching(true);
    try {
      await gitFetch(repo, token);
      setLastFetchTime(new Date());
      onFetchCompleteRef.current?.();
    } catch (e) {
      console.warn('Auto-fetch failed:', e);
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);
    }
  }, [repo, token]);

  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const intervalMinutes = config.fetchInterval || 0;
    if (intervalMinutes <= 0 || !repo?.isLocal) return;

    // Set up auto-fetch interval
    intervalRef.current = setInterval(() => {
      fetchNow();
    }, intervalMinutes * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [config.fetchInterval, repo, fetchNow]);

  return { isFetching, setIsFetching, lastFetchTime, setLastFetchTime, fetchNow };
}

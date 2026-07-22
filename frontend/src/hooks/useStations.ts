import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getStations } from '../api/subway';
import { Station } from '../types/subway';

export function useStations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [lineName, setLineName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;

    getStations()
      .then((response) => {
        if (cancelled) return;
        setStations(response.stations);
        setLineName(response.lineName);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', '역 목록을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { stations, lineName, loading, error };
}

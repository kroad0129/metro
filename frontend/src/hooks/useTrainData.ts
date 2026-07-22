import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getTrains } from '../api/subway';
import { TrainsResponse } from '../types/subway';

export const REFRESH_COOLDOWN_MS = 3000;

/**
 * 열차 데이터 조회를 감싼다. 조회 시점은 세 가지뿐이다 — 마운트, 역 변경, refresh().
 *
 * 자동 폴링은 의도적으로 없다. 개발키 호출 한도가 1000회/일이라
 * 15초 폴링이면 하루 약 4시간이면 소진된다(스펙 1절).
 * 폴링을 도입할 때는 이 훅 안에 setInterval을 넣으면 되고, 컴포넌트는 수정하지 않는다.
 */
export function useTrainData(stationId: string | null) {
  const [data, setData] = useState<TrainsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [canRefresh, setCanRefresh] = useState(true);

  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const load = useCallback((id: string) => {
    const current = ++requestId.current;
    setLoading(true);
    setCanRefresh(false);

    getTrains(id)
      .then((response) => {
        if (current !== requestId.current) return; // 더 늦게 시작한 요청이 있으면 버린다
        setData(response);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (current !== requestId.current) return;
        setData(null);
        setError(
          caught instanceof ApiError ? caught : new ApiError('UNKNOWN', '열차 정보를 불러오지 못했습니다.'),
        );
      })
      .finally(() => {
        if (current !== requestId.current) return;
        setLoading(false);
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(() => setCanRefresh(true), REFRESH_COOLDOWN_MS);
      });
  }, []);

  useEffect(() => {
    if (stationId === null) return;
    load(stationId);
  }, [stationId, load]);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    [],
  );

  const refresh = useCallback(() => {
    if (stationId === null || !canRefresh) return;
    load(stationId);
  }, [stationId, canRefresh, load]);

  return { data, loading, error, refresh, canRefresh };
}

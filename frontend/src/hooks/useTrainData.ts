import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getTrains } from '../api/subway';
import type { TrainsResponse } from '../types/subway';

export const REFRESH_COOLDOWN_MS = 3000;
export const POLL_INTERVAL_MS = 15000;

/**
 * 카운트다운 기준 시각은 응답의 recptnAt(서울시가 그 값을 산출한 시각)이므로
 * 클라이언트가 따로 앵커를 기록할 필요가 없다 — 폴링을 건너도 기준이 흔들리지 않는다.
 */

/**
 * 열차 데이터 조회를 감싼다. 기본 조회 시점은 마운트·역 변경·refresh() 세 가지다.
 *
 * pollMs를 넘기면 그 간격으로 자동 폴링한다. 단 탭이 보일 때만 돈다 — 탭이 가려지면
 * 멈추고, 다시 보이면 즉시 한 번 불러온 뒤 재개한다(호출 낭비 방지). pollMs가 없으면
 * 폴링하지 않는다(수동 새로고침만). 서울시 소스가 약 10~15초마다 갱신되므로 15초면
 * 충분하고, 그 사이는 화면의 초 단위 카운트다운이 채운다.
 */
export function useTrainData(stationId: string | null, pollMs: number | null = null) {
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

  // 자동 폴링 — 탭이 보일 때만. pollMs가 없으면 아무것도 하지 않는다(수동 전용).
  useEffect(() => {
    if (stationId === null || pollMs === null || pollMs <= 0) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (intervalId === null) intervalId = setInterval(() => load(stationId), pollMs);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load(stationId); // 다시 보이면 즉시 최신화
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stationId, pollMs, load]);

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

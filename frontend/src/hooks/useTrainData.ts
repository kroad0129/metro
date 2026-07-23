import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getTrains } from '../api/subway';
import type { TrainsResponse } from '../types/subway';
import { nextStationSeconds } from '../utils/virtualTrain';

export const REFRESH_COOLDOWN_MS = 3000;
export const POLL_INTERVAL_MS = 15000;

type SegmentAnchor = { stationsAway: number; startedAtMs: number };

/**
 * 각 열차가 "지금 구간"에 들어온 시각을 추적한다.
 *
 * barvlDt는 구간 진입 시점의 값이고 구간을 지나는 동안 줄지 않는다. 그래서 카운트다운 기준을
 * recptnAt(데이터 생성 시각)으로 잡으면 안 된다 — recptnAt은 10~27초마다 갱신되는데 barvlDt는
 * 그대로여서, 갱신될 때마다 남은 시간이 도로 늘어난다(실측으로 확인한 버그).
 *
 * 대신 stationsAway(ordkey 거리)가 바뀐 순간을 구간 진입으로 보고 그때부터 센다.
 * 처음 본 열차는 구간 어디쯤인지 알 수 없으므로 "절반쯤 왔다"고 가정한다 — 진입 직후로 보면
 * 최대 한 구간(~140초)만큼 과대평가해 실제보다 여유 있다고 오해하게 만들기 때문이다.
 * 다음 구간 진입을 한 번 관측하면 그때부터는 정확해진다.
 */
function annotateSegments(
  response: TrainsResponse,
  prev: Map<string, SegmentAnchor>,
  nowMs: number,
): { response: TrainsResponse; anchors: Map<string, SegmentAnchor> } {
  const anchors = new Map<string, SegmentAnchor>();

  const directions = response.directions.map((direction) => ({
    ...direction,
    trains: direction.trains.map((train) => {
      const { trainId, stationsAway, remainingSeconds, recptnAt } = train;
      if (stationsAway === null) return train;

      const observedAt = recptnAt === null ? nowMs : Date.parse(recptnAt);
      const baseMs = Number.isFinite(observedAt) ? observedAt : nowMs;

      const old = prev.get(trainId);
      let startedAtMs: number;
      if (old && old.stationsAway === stationsAway) {
        startedAtMs = old.startedAtMs; // 같은 구간 — 기준 유지
      } else if (old) {
        startedAtMs = baseMs; // 구간 진입을 방금 관측했다 — 정확한 기준
      } else {
        // 처음 본 열차 — 구간 절반쯤 왔다고 본다
        const floor = remainingSeconds === null ? 0 : nextStationSeconds(remainingSeconds, stationsAway);
        const halfSegmentMs = remainingSeconds === null ? 0 : ((remainingSeconds - floor) / 2) * 1000;
        startedAtMs = baseMs - halfSegmentMs;
      }

      anchors.set(trainId, { stationsAway, startedAtMs });
      return { ...train, segmentStartedAtMs: startedAtMs };
    }),
  }));

  return { response: { ...response, directions }, anchors };
}

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
  // 열차별 구간 진입 시각 — 폴링을 건너 유지해야 카운트다운이 이어진다.
  const segments = useRef<Map<string, SegmentAnchor>>(new Map());

  const load = useCallback((id: string) => {
    const current = ++requestId.current;
    setLoading(true);
    setCanRefresh(false);

    getTrains(id)
      .then((raw) => {
        if (current !== requestId.current) return; // 더 늦게 시작한 요청이 있으면 버린다
        const { response, anchors } = annotateSegments(raw, segments.current, Date.now());
        segments.current = anchors;
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
    segments.current = new Map(); // 역이 바뀌면 거리 기준이 달라지므로 초기화
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

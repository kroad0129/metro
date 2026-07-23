import type { DirectionId, TrainType } from '../types/subway';

/**
 * 페이스 테이블 — "이 역에서 d정거장 떨어진 열차의 barvlDt"를 관측으로 학습한다.
 *
 * 실측으로 barvlDt는 (역, 방향, 거리)별 고정 조회표임을 확인했다(3정거장이면 늘 345초,
 * 열차가 달라도 같음). 그래서 어떤 열차가 d에 있을 때 그 값을 기록해 두면, 뒤따라오는
 * 열차가 d+1에서 d로 넘어갈 때 도달할 값(= 카운트다운의 바닥)을 정확히 안다.
 * 균등 분배(barvlDt × (d-1)/d)는 구간별 소요 차이(실측 95~140초)를 무시해 시간이
 * 바닥에 일찍/늦게 닿아 멈춤·튐을 만들었다 — 학습된 값이 이를 없앤다.
 *
 * 급행은 정차 패턴이 달라 학습에서도, 적용에서도 제외한다(균등 분배 사용).
 * localStorage에 역별로 저장해 재방문 시 첫 폴링부터 정확하다.
 */
export type PaceTable = Map<string, number>;

const keyOf = (direction: DirectionId, stationsAway: number) => `${direction}:${stationsAway}`;

/** 이번 응답에서 관측된 (방향, 거리) → barvlDt를 테이블에 반영한다. */
export function learnPace(
  table: PaceTable,
  direction: DirectionId,
  stationsAway: number | null,
  remainingSeconds: number | null,
  trainType: TrainType,
): void {
  if (trainType !== 'LOCAL') return;
  if (stationsAway === null || stationsAway < 0) return;
  if (remainingSeconds === null || remainingSeconds <= 0) return;
  table.set(keyOf(direction, stationsAway), remainingSeconds);
}

/**
 * d정거장 떨어진 열차의 카운트다운 바닥(= 다음 구간에 들어설 때 barvlDt가 될 값).
 * 학습된 값이 있으면 그걸, 없으면 균등 분배로 추정한다.
 * 마지막 구간(d=1)의 바닥은 "내 역 진입" 시점 값이다(실측 95초 → 진입 20초).
 */
export function floorSecondsFor(
  table: PaceTable,
  direction: DirectionId,
  stationsAway: number,
  remainingSeconds: number,
  trainType: TrainType,
): number {
  if (stationsAway <= 0) return 0;

  if (trainType === 'LOCAL') {
    const learned = table.get(keyOf(direction, stationsAway - 1));
    if (learned !== undefined && learned < remainingSeconds) return learned;
  }

  // 균등 분배 추정. d=1은 진입 시점 값(≈20%)에서 멈춘다.
  return (remainingSeconds * Math.max(stationsAway - 1, 0.2)) / stationsAway;
}

const STORAGE_PREFIX = 'metro:pace:v1:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 시간표 개정 대비 일주일이면 다시 배운다

export function loadPaceTable(stationId: string): PaceTable {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + stationId);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as { savedAt?: number; entries?: [string, number][] };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return new Map();
    return new Map(parsed.entries ?? []);
  } catch {
    return new Map();
  }
}

export function savePaceTable(stationId: string, table: PaceTable): void {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + stationId,
      JSON.stringify({ savedAt: Date.now(), entries: [...table.entries()] }),
    );
  } catch {
    /* 저장 불가 환경은 무시 — 세션 내 학습만으로도 동작한다 */
  }
}

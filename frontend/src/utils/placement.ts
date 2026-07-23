import type { Train } from '../types/subway';
import { leftPercentFromGaps } from './virtualTrain';

/**
 * 이산 배치 모델 — API가 확실히 아는 것만 그린다.
 *
 * 구간 내 몇 % 지점인지는 아무도 모르는 정보라 흉내내지 않는다(스펙
 * 2026-07-23-discrete-placement.md). 대신 상태(arvlCd)가 보장하는 두 가지만 쓴다:
 * - 역에 있다(도착·진입) → 그 역 위의 점. 진입은 arriving으로 구분해 맥동시킨다.
 * - 구간에 있다(출발·운행중) → 두 역 사이의 흐르는 화살표. 위치는 주장하지 않는다.
 *
 * 전전역 이상(d≥2)은 "운행중"만 와서 정차·이동을 구분할 수 없다 — 구간 이동으로
 * 그리는 게 평균적으로 정직하다(정차 ~30초 vs 구간 90~130초). 상류 역을 추가 조회하면
 * 정확해지는데(정식키 이후 계획), 그때도 이 함수는 상태만 보므로 그대로 맞아진다.
 */
export type Placement =
  | { kind: 'station'; gap: number; arriving: boolean }
  | { kind: 'segment'; fromGap: number; toGap: number }
  | null;

export function trainPlacement(train: Train): Placement {
  const { stationsAway: gap, status } = train;
  if (gap === null) return null;
  if (status === 'ARRIVED') return { kind: 'station', gap, arriving: false };
  if (status === 'APPROACHING') return { kind: 'station', gap, arriving: true };
  // DEPARTED·TRAVELING. 내 역(d=0)은 출발이면 지나간 것, 운행중이면 진입으로 본다.
  if (gap === 0) return status === 'DEPARTED' ? null : { kind: 'station', gap: 0, arriving: true };
  return { kind: 'segment', fromGap: gap, toGap: gap - 1 };
}

/** 구간을 트랙 좌표로 — 시작 left(%)와 진행 방향 폭(%). 트랙 밖이면 null. */
export function segmentPercents(
  maxGaps: number,
  fromGap: number,
  toGap: number,
): { left: number; width: number } | null {
  if (maxGaps <= 0) return null;
  const left = leftPercentFromGaps(maxGaps, fromGap);
  const right = leftPercentFromGaps(maxGaps, toGap);
  if (left === null || right === null) return null;
  return { left, width: right - left };
}

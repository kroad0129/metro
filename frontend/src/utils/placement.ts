import type { Train } from '../types/subway';

/**
 * 이산 배치 모델 — API가 확실히 아는 것만 그린다.
 *
 * 구간 내 몇 % 지점인지는 아무도 모르는 정보라 보간하지 않는다(스펙
 * 2026-07-23-discrete-placement.md). 대신 상태(arvlCd)가 보장하는 것만 쓴다:
 * - 역에 서 있다(도착) → 그 역 위의 점.
 * - 구간에 있다 → 흐르는 화살표. 상태가 구간의 어느 위상인지도 말해주므로 3분할한다:
 *   출발 = 첫 ⅓(떠난 역 직후), 운행중 = 가운데 ⅓, 진입 = 마지막 ⅓(다음 역 직전).
 *   이건 우리가 지어내는 위치가 아니라 상태의 의미 그대로다.
 *
 * 전전역 이상(d≥2)은 "운행중"만 와서 정차·이동을 구분할 수 없다 — 구간 가운데로
 * 그리는 게 평균적으로 정직하다(정차 ~30초 vs 구간 90~130초). 상류 역을 추가 조회하면
 * 정확해지는데(정식키 이후 계획), 그때도 이 함수는 상태만 보므로 그대로 맞아진다.
 */
export type SegmentPhase = 'depart' | 'run' | 'arrive';

export type Placement =
  | { kind: 'station'; gap: number }
  | { kind: 'segment'; fromGap: number; toGap: number; phase: SegmentPhase }
  | null;

export function trainPlacement(train: Train): Placement {
  const { stationsAway: gap, status } = train;
  if (gap === null) return null;
  if (status === 'ARRIVED') return { kind: 'station', gap };
  // 진입: 들어서는 역(gap)으로 가는 구간의 끝자락. d=0이면 전역→내 역 구간이다.
  if (status === 'APPROACHING') return { kind: 'segment', fromGap: gap + 1, toGap: gap, phase: 'arrive' };
  if (gap === 0) {
    // 내 역 출발이면 지나간 것. 운행중+d=0 비정상 조합은 진입으로 본다 — 열차를 잃지 않는다.
    return status === 'DEPARTED' ? null : { kind: 'segment', fromGap: 1, toGap: 0, phase: 'arrive' };
  }
  return { kind: 'segment', fromGap: gap, toGap: gap - 1, phase: status === 'DEPARTED' ? 'depart' : 'run' };
}

/** 배치가 구간일 때 위상별 순서(출발 0 → 운행 1 → 진입 2). */
const PHASE_INDEX: Record<SegmentPhase, number> = { depart: 0, run: 1, arrive: 2 };

/**
 * 구간의 해당 ⅓을 트랙 좌표로 — 시작 left(%)와 폭(%). 트랙 밖이면 null.
 *
 * 구간 시작이 트랙 왼쪽 밖이어도(트랙 끝 역에 진입 중인 열차) 위상이 트랙에 걸치면
 * 가장자리에 잘려서 보여준다 — 열차가 화면 밖에서 갑자기 튀어나오지 않게.
 */
export function segmentPercents(
  maxGaps: number,
  fromGap: number,
  toGap: number,
  phase: SegmentPhase,
): { left: number; width: number } | null {
  if (maxGaps <= 0) return null;
  const rawLeft = (1 - fromGap / maxGaps) * 100;
  const rawRight = (1 - toGap / maxGaps) * 100;
  if (rawRight < 0 || rawLeft > 100) return null;

  const third = (rawRight - rawLeft) / 3;
  const start = rawLeft + PHASE_INDEX[phase] * third;
  if (start + third <= 0) return null; // 이 위상은 아직 트랙 밖이다

  const left = Math.max(0, start);
  return { left, width: start + third - left };
}

/**
 * 트랙 위 시각적 자리(%)가 겹치는 열차들에게 줄(lane)을 배정한다 — 겹치면 아랫줄로.
 * 급행이 일반과 같은 구간·위상을 달리거나 두 열차가 같은 역에 걸칠 때 글자·기호가
 * 포개지는 것을 막는다. 입력 순서(가까운 열차 우선)대로 비는 가장 윗줄을 준다.
 * 끝점이 닿기만 하는 인접 구간은 겹침으로 치지 않는다.
 */
export function assignLanes(intervals: { start: number; end: number }[]): number[] {
  const laneEndsByLane: { start: number; end: number }[][] = [];
  return intervals.map((interval) => {
    let lane = 0;
    while (laneEndsByLane[lane]?.some((o) => interval.start < o.end && o.start < interval.end)) {
      lane += 1;
    }
    (laneEndsByLane[lane] ??= []).push(interval);
    return lane;
  });
}

import type { TrainStatus } from '../types/subway';

/**
 * 가상 열차 모델 — 폴링 스냅샷 사이를 실제 지하철 운행 리듬으로 채운다.
 *
 * 원리(실측 근거는 스펙 2026-07-23-time-model-from-measurement.md):
 * - 운영사 추정치(barvlDt)의 위상 간격이 곧 페이스다: 전전역 220초 → 전역 95초 → 진입 20초.
 *   즉 한 정거장 ≈ 110초, 출발→진입 ≈ 75초, 진입→도착 ≈ 15~20초.
 * - 위상(현재역+상태)이 바뀐 시각(anchor)부터 이 페이스로 가상 위치를 전진시킨다.
 * - 단, API가 다음 위상을 확인해주기 전에는 구간 끝 직전(cap)에서 멈춰 기다린다 —
 *   전광판이 다음 폐색 확인 전까지 구간 안에서만 열차를 움직이는 것과 같다.
 *   그래서 거짓 도착이 없고, 지연(위상이 길어짐)은 "역 앞 대기"로 자연스럽게 보인다.
 * - 정차(ARRIVED)는 절대 자동 출발하지 않는다. 출발 확인이 와야 움직인다.
 *
 * 위치 단위는 "선택역까지 남은 정거장 수(gaps)". 0 = 선택역 도착, 1 = 전역, 음수 = 지나감.
 */

/** 한 정거장 소요(초). 운영사 barvlDt 간격(220→95→20)에서 유도. 남은 시간 = gaps × 이 값. */
export const SECONDS_PER_GAP = 110;

type Segment = {
  /** 위상 시작 시점의 가상 위치(gaps). */
  startGaps: number;
  /** 다음 위상 확인 전까지 넘지 않는 상한(gaps, 작을수록 선택역에 가까움). */
  capGaps: number;
  /** start→cap 이동에 걸리는 시간(초). 0이면 움직이지 않는다(정차). */
  durationSeconds: number;
};

/**
 * 위상별 이동 구간. d = 현재역이 선택역에서 몇 정거장 전인지(order 차이).
 * 페이스는 전부 ≈1정거장/110초로 통일돼 있어 위상이 바뀌어도 속도가 튀지 않는다.
 */
export function phaseSegment(status: TrainStatus, d: number): Segment {
  switch (status) {
    case 'ARRIVED': // 그 역에 정차 — 출발 확인 전까지 그대로 선다
      return { startGaps: d, capGaps: d, durationSeconds: 0 };
    case 'DEPARTED': // 그 역을 막 출발 — 다음 역 직전(0.15)까지 기어간다
      return { startGaps: d - 0.1, capGaps: d - 0.85, durationSeconds: 75 };
    case 'APPROACHING': // 그 역에 진입 중 — 역 코앞(0.02)까지 짧게
      return { startGaps: d + 0.1, capGaps: d + 0.02, durationSeconds: 15 };
    case 'TRAVELING': // 역 부근 운행(원거리는 정차 구분이 없어 정차 시간을 페이스에 녹인다)
      return { startGaps: d, capGaps: d - 0.85, durationSeconds: 94 };
  }
}

/**
 * 지금 이 순간의 가상 위치(gaps). anchorSinceMs = 이 위상을 처음 관측한 시각.
 * 앵커가 없으면(처음 본 열차) 위상 시작점에 둔다 — 실제보다 뒤에 있을 순 있어도 앞서진 않는다.
 */
export function virtualGaps(
  status: TrainStatus,
  d: number,
  anchorSinceMs: number | undefined,
  nowMs: number,
): number {
  const seg = phaseSegment(status, d);
  if (seg.durationSeconds <= 0 || anchorSinceMs === undefined) return seg.startGaps;

  const elapsed = Math.max(0, (nowMs - anchorSinceMs) / 1000);
  const progress = Math.min(1, elapsed / seg.durationSeconds);
  return seg.startGaps + (seg.capGaps - seg.startGaps) * progress;
}

/** 가상 위치에서 남은 시간(초). 점과 시간이 같은 모델에서 나와 서로 모순되지 않는다. */
export function virtualRemainingSeconds(gaps: number): number {
  return Math.max(0, gaps * SECONDS_PER_GAP);
}

/**
 * 가상 위치(gaps)를 트랙 left(%)로. 선택역이 오른쪽 끝(100%)이고 maxGaps 정거장 전이 0%다.
 * - 이미 지나간 열차(gaps < 0에 여유 포함)는 null — 그리지 않는다.
 * - 트랙보다 먼 열차도 null — "다음 열차 N분" 텍스트로 처리한다.
 */
export function leftPercentFromGaps(maxGaps: number, gaps: number): number | null {
  if (gaps < -0.05) return null; // 선택역을 지나갔다
  if (maxGaps <= 0) return 100;
  if (gaps > maxGaps) return null; // 트랙 밖(멀다)

  const percent = (1 - gaps / maxGaps) * 100;
  return Math.min(100, Math.max(0, percent));
}

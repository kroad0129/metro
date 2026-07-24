import type { Train } from '../types/subway';

/**
 * 가상 열차의 시간 모델 — 폴링 스냅샷 사이에도 남은 시간이 실제처럼 흐르게 한다.
 * (위치는 이산 배치 모델 `placement.ts`가 맡는다 — 구간 내 위치는 보간하지 않는다.)
 *
 * 실측으로 확인한 API의 성질(스펙 2026-07-23-time-model-from-measurement.md):
 * - `barvlDt`는 (역, 방향, 거리)별 고정 조회표다. 구간을 지나는 동안 줄지 않고,
 *   recptnDt가 갱신돼도 그대로다. 열차가 다음 구간에 들어설 때만 다음 값으로 떨어진다.
 * - `ordkey`가 남은 정거장 수(d)를 정수로 준다.
 *
 * 그래서 시간은 움직이기 시작한 시각부터 실제로 흐른 만큼 빼되, 다음 구간의 barvlDt
 * (페이스 테이블에서 학습한 바닥) 밑으로는 내려가지 않는다. 정차(도착) 중인 열차는 아직
 * 출발 전이라 카운트다운이 줄지 않고 barvlDt에 얼려 있다 — 대피로 오래 서 있어도 "곧 도착"
 * 이라 거짓말하지 않는다. 멈추면 남은 시간은 정직하게 늘어난다(실제로 더 걸리므로).
 */

/** 균등 분배 폴백 — 페이스 테이블에 학습값이 없을 때 다음 구간 진입 시점 값을 추정한다. */
export function nextStationSeconds(barvlDt: number, stationsAway: number): number {
  if (stationsAway <= 0) return 0;
  return (barvlDt * Math.max(stationsAway - 1, 0.2)) / stationsAway;
}

function floorOf(train: Train): number {
  if (train.floorSeconds !== undefined) return train.floorSeconds;
  if (train.remainingSeconds === null || train.stationsAway === null) return 0;
  return nextStationSeconds(train.remainingSeconds, train.stationsAway);
}

/**
 * 지금 이 순간의 남은 시간(초). 구간 진입 시각부터 흐른 만큼 빼고, 바닥에서 멈춘다.
 */
export function liveRemainingSeconds(train: Train, nowMs: number): number | null {
  const { remainingSeconds, stationsAway, status, segmentStartedAtMs } = train;
  if (remainingSeconds === null) return null;

  // 정차(도착) 중이면 아직 출발 전 — 구간을 하나도 지나지 않았으니 남은 시간이 줄지 않는다.
  // 바닥까지 내려가게 두면 대피 중인 열차가 거짓 "곧 도착"을 띄우고, 앞서 달리는 열차보다
  // 위로 오는 오정렬을 만든다(재생 검증·화면 캡처로 확인).
  if (status === 'ARRIVED') return remainingSeconds;
  if (stationsAway === null) return remainingSeconds;

  // 카운트다운 기준 시각: 움직이기 시작한 순간(moveStartMs)이 있으면 그것, 없으면 구간 진입 시각.
  // 대피로 오래 서 있다 출발한 열차는 segmentStartedAtMs가 옛날이라, 그걸 기준 삼으면 출발하자마자
  // 바닥으로 스냅한다 — 출발 순간을 기준으로 구간 처음(전체 소요)부터 센다.
  const anchorMs = train.moveStartMs ?? segmentStartedAtMs;
  if (anchorMs === undefined) return remainingSeconds;
  const anchorRemaining = train.moveStartRemainingSeconds ?? remainingSeconds;

  const floor = floorOf(train);
  const elapsed = Math.max(0, (nowMs - anchorMs) / 1000);
  return Math.max(floor, anchorRemaining - elapsed);
}

/**
 * 정거장 수(gaps)를 트랙 left(%)로. 선택역이 오른쪽 끝(100%), maxGaps 정거장 전이 0%.
 * 지나갔거나(gaps < 0) 트랙보다 멀면 null — 호출부가 "다음 열차"로 처리한다.
 */
export function leftPercentFromGaps(maxGaps: number, gaps: number): number | null {
  if (gaps < -0.05) return null;
  if (maxGaps <= 0) return 100;
  if (gaps > maxGaps) return null;

  const percent = (1 - gaps / maxGaps) * 100;
  return Math.min(100, Math.max(0, percent));
}

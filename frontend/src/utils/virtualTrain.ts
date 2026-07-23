import type { Train, TrainStatus } from '../types/subway';

/**
 * 가상 열차의 시간 모델 — 폴링 스냅샷 사이에도 남은 시간이 실제처럼 흐르게 한다.
 * (위치는 이산 배치 모델 `placement.ts`가 맡는다 — 구간 내 위치는 보간하지 않는다.)
 *
 * 실측으로 확인한 API의 성질(스펙 2026-07-23-time-model-from-measurement.md):
 * - `barvlDt`는 (역, 방향, 거리)별 고정 조회표다. 구간을 지나는 동안 줄지 않고,
 *   recptnDt가 갱신돼도 그대로다. 열차가 다음 구간에 들어설 때만 다음 값으로 떨어진다.
 * - `ordkey`가 남은 정거장 수(d)를 정수로 준다.
 *
 * 그래서 시간은 "구간 진입 시각"부터 실제로 흐른 만큼 빼되, 다음 구간의 barvlDt
 * (페이스 테이블에서 학습한 바닥) 밑으로는 내려가지 않는다 — 지연된 열차는 바닥에서
 * 멈춘 카운트다운으로 보이고, 먼저 도착했다고 거짓말하지 않는다. 바닥에 멈춘 시간이
 * 길어지면 stallSeconds가 그걸 "지연"이라는 정보로 바꾼다.
 */

/** 균등 분배 폴백 — 페이스 테이블에 학습값이 없을 때 다음 구간 진입 시점 값을 추정한다. */
export function nextStationSeconds(barvlDt: number, stationsAway: number): number {
  if (stationsAway <= 0) return 0;
  return (barvlDt * Math.max(stationsAway - 1, 0.2)) / stationsAway;
}

/** 역(도착/진입)에 붙어 서 있는 상태인가 — 이산 배치 모델(placement.ts)과 같은 기준. */
function isParked(status: TrainStatus): boolean {
  return status === 'ARRIVED' || status === 'APPROACHING';
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
  const { remainingSeconds, stationsAway, segmentStartedAtMs } = train;
  if (remainingSeconds === null) return null;
  if (stationsAway === null) return remainingSeconds;
  if (segmentStartedAtMs === undefined) return remainingSeconds;

  const floor = floorOf(train);
  const elapsed = Math.max(0, (nowMs - segmentStartedAtMs) / 1000);
  return Math.max(floor, remainingSeconds - elapsed);
}

/**
 * 이번 이동(출발→다음 역)에 걸릴 것으로 보는 시간(초).
 *
 * 기본은 남은 시간 예산(이동 시작 시점 남은 시간 − 바닥)이다. 단 정차가 길어져 예산이
 * 바닥났어도 실제 주행에는 물리적 시간이 걸린다 — 예산이 최소 주행시간(실측 40~50초)보다
 * 작으면 그만큼은 보장한다. 이게 없으면 긴 정차 후 출발한 열차가 출발 즉시
 * "지연"으로 오판된다(stallSeconds가 이 값을 기준으로 삼는다).
 */
const MIN_MOVE_SECONDS = 40;

function moveSpanSeconds(train: Train): number {
  const start = train.moveStartRemainingSeconds ?? train.remainingSeconds ?? 0;
  return Math.max(start - floorOf(train), MIN_MOVE_SECONDS);
}

/**
 * 이 열차가 운영사 추정보다 얼마나 오래 같은 구간에 머무는지(초).
 *
 * barvlDt가 암시하는 구간 소요를 다 썼는데도 다음 구간 확인이 안 오면 열차가 실제로
 * 지연 중이라는 뜻이다(재생 검증: 당산→선유도 추정 125초, 실제 191초 사례). 이때 점과
 * 시간은 바닥에 멈추는 게 정직한 표시지만, 사용자가 버그로 오해하지 않도록 이 값을 근거로
 * "지연"을 표시한다 — 멈춤을 정보로 바꾼다.
 */
export function stallSeconds(train: Train, nowMs: number): number {
  const { remainingSeconds, stationsAway, status } = train;
  if (remainingSeconds === null || stationsAway === null) return 0;
  if (isParked(status)) return 0; // 정차·진입은 정상 정지

  const startMs = train.moveStartMs ?? train.segmentStartedAtMs;
  if (startMs === undefined) return 0;

  const elapsed = (nowMs - startMs) / 1000;
  return Math.max(0, elapsed - moveSpanSeconds(train));
}

/** 이 시간(초) 이상 추정을 초과하면 화면에 "지연"을 표시한다. */
export const DELAY_NOTICE_SECONDS = 20;

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

import type { Train, TrainStatus } from '../types/subway';

/**
 * 가상 열차 모델 — 폴링 스냅샷 사이를 실제 운행처럼 채운다.
 *
 * 실측으로 확인한 API의 성질(스펙 2026-07-23-time-model-from-measurement.md):
 * - `barvlDt`는 (역, 방향, 거리)별 고정 조회표다. 구간을 지나는 동안 줄지 않고,
 *   recptnDt가 갱신돼도 그대로다. 열차가 다음 구간에 들어설 때만 다음 값으로 떨어진다.
 * - `ordkey`가 남은 정거장 수(d)를 정수로 준다.
 *
 * 그래서 시간은 "구간 진입 시각"부터 실제로 흐른 만큼 빼되, 다음 구간의 barvlDt
 * (페이스 테이블에서 학습한 바닥) 밑으로는 내려가지 않는다 — 지연된 열차는 바닥에서
 * 멈춘 카운트다운으로 보이고, 먼저 도착했다고 거짓말하지 않는다.
 *
 * 점은 시간과 같은 진행률로 움직이되, 정차(도착) 중에는 역에 서 있는다. 출발이 관측되면
 * 그 순간의 남은 시간(moveStartRemainingSeconds)에서 바닥까지 줄어드는 비율로 이동한다 —
 * 실제 열차처럼 "역 사이에서는 구간 평균보다 빠르게" 달리는 모양이 자연히 나온다.
 */

/** 균등 분배 폴백 — 페이스 테이블에 학습값이 없을 때 다음 구간 진입 시점 값을 추정한다. */
export function nextStationSeconds(barvlDt: number, stationsAway: number): number {
  if (stationsAway <= 0) return 0;
  return (barvlDt * Math.max(stationsAway - 1, 0.2)) / stationsAway;
}

/** 역(도착/진입)에 붙어 서 있어야 하는 상태인가. 내 역 진입(d=0)만은 이동으로 본다. */
function isParked(status: TrainStatus, stationsAway: number): boolean {
  if (status === 'ARRIVED') return true;
  return status === 'APPROACHING' && stationsAway > 0;
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
 * 지금 이 순간의 가상 위치 — 선택역까지 남은 정거장 수(0 = 도착, 1 = 전역, 음수 = 지나감).
 *
 * - 정차/전역 진입 중: 그 역(gaps = d)에 서 있는다. 시간은 흐르되 점은 멈춘다(실제와 일치).
 * - 이동 중: 움직이기 시작한 순간의 남은 시간 → 바닥의 진행률만큼 d → cap으로 전진한다.
 *   cap은 다음 역(d−1). 단 마지막 구간은 역 코앞(0.08)에서 멈춰, 진입 확인(d=0) 전에
 *   도착한 것처럼 보이지 않게 한다.
 * - 내 역을 출발(d=0, DEPARTED)한 열차는 음수 — 그리지 않는다.
 */
export function virtualGaps(train: Train, nowMs: number): number | null {
  const { remainingSeconds, stationsAway, status } = train;
  if (stationsAway === null) return null;
  if (stationsAway === 0 && status === 'DEPARTED') return -1; // 내 역을 떠났다
  if (isParked(status, stationsAway)) {
    return status === 'ARRIVED' && stationsAway === 0 ? 0 : stationsAway;
  }
  if (remainingSeconds === null) return stationsAway;

  const startMs = train.moveStartMs ?? train.segmentStartedAtMs;
  if (startMs === undefined) return stationsAway;

  // 내 역 진입(d=0): 코앞(0.08)에서 문 앞(0.02)까지 짧게 다가간다.
  const [fromGaps, capGaps] =
    stationsAway === 0 ? [0.08, 0.02] : [stationsAway, Math.max(stationsAway - 1, 0.08)];

  const elapsed = Math.max(0, (nowMs - startMs) / 1000);
  const progress = Math.min(1, elapsed / moveSpanSeconds(train));
  return fromGaps - progress * (fromGaps - capGaps);
}

/**
 * 이번 이동(출발→다음 역)에 걸릴 것으로 보는 시간(초).
 *
 * 기본은 남은 시간 예산(이동 시작 시점 남은 시간 − 바닥)이다. 단 정차가 길어져 예산이
 * 바닥났어도 실제 주행에는 물리적 시간이 걸린다 — 예산이 최소 주행시간(실측 40~50초)보다
 * 작으면 그만큼은 보장한다. 이게 없으면 긴 정차 후 출발 순간 점이 다음 역 앞까지
 * 순간이동한다(재생 검증에서 관측된 결함).
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
  if (isParked(status, stationsAway)) return 0; // 정차는 정상 정지

  const startMs = train.moveStartMs ?? train.segmentStartedAtMs;
  if (startMs === undefined) return 0;

  const elapsed = (nowMs - startMs) / 1000;
  return Math.max(0, elapsed - moveSpanSeconds(train));
}

/** 이 시간(초) 이상 추정을 초과하면 화면에 "지연"을 표시한다. */
export const DELAY_NOTICE_SECONDS = 20;

/**
 * 가상 위치(gaps)를 트랙 left(%)로. 선택역이 오른쪽 끝(100%), maxGaps 정거장 전이 0%.
 * 지나갔거나(gaps < 0) 트랙보다 멀면 null — 호출부가 "다음 열차"로 처리한다.
 */
export function leftPercentFromGaps(maxGaps: number, gaps: number): number | null {
  if (gaps < -0.05) return null;
  if (maxGaps <= 0) return 100;
  if (gaps > maxGaps) return null;

  const percent = (1 - gaps / maxGaps) * 100;
  return Math.min(100, Math.max(0, percent));
}

import type { Train } from '../types/subway';

/**
 * 가상 열차 모델 — 폴링 스냅샷 사이를 실제 운행처럼 채운다.
 *
 * 실측으로 확인한 API의 성질(스펙 2026-07-23-time-model-from-measurement.md):
 * - `barvlDt`는 실시간 카운트다운이 아니라 "역 단위 조회표"다. 데이터가 10~27초마다
 *   재생성(recptnDt 갱신)돼도 같은 역에 있는 동안 값이 그대로다(3정거장이면 계속 345초).
 * - 하지만 벤더 명세는 명시한다: **barvlDt는 recptnDt 시점의 값이니, 그 이후 흐른 만큼
 *   빼서 써야 한다.** 그래서 카운트다운의 기준점은 "우리가 받은 시각"이 아니라 recptnDt다.
 * - `ordkey`가 남은 정거장 수를 정수로 준다(예 "01003개화0" → 3). 역명 매칭보다 정확하다.
 *
 * 그래서 페이스를 상수로 박지 않고 **그 열차의 barvlDt에서 직접 얻는다**. 열차·구간마다
 * 다른 실제 소요(실측 125~187초/정거장)가 자동 반영된다.
 */

/**
 * 다음 역에 닿았을 때 API가 보고할 barvlDt 추정치.
 * 거리에 비례해 줄어든다고 보면 실측과 잘 맞는다(885초/7정거장 → 6정거장에서 760초, 추정 758초).
 * 마지막 한 정거장(d=1)은 0이 아니라 "내 역 진입" 시점 값(실측 ≈ barvlDt의 20%)으로 둔다 —
 * 그래야 전역에서 지연될 때 카운트다운이 0까지 내려가 거짓 도착이 되지 않는다.
 */
export function nextStationSeconds(barvlDt: number, stationsAway: number): number {
  if (stationsAway <= 0) return 0;
  return (barvlDt * Math.max(stationsAway - 1, 0.2)) / stationsAway;
}

/**
 * 다음 위상에서 도달할 위치(남은 정거장 수) — 위치의 상한.
 * 마지막 한 정거장은 0이 아니라 역 코앞에서 멈춘다. 내 역 진입이 확인되기 전에 점이 역에
 * 붙어버리면 "24초 남았는데 이미 도착"처럼 보이기 때문이다. 진입이 확인되면 stationsAway가
 * 0이 되어 그때 100%에 닿는다.
 */
export function nextStationGaps(stationsAway: number): number {
  return Math.max(stationsAway - 1, 0.08);
}

/**
 * 지금 이 순간의 남은 시간(초).
 *
 * 기준점은 recptnAt(데이터 생성 시각)이 아니라 **구간 진입 시각**(segmentStartedAtMs)이다.
 * barvlDt는 구간을 지나는 동안 줄지 않으므로, recptnAt이 갱신될 때마다 거기서 다시 빼면
 * 남은 시간이 도로 늘어난다(실측으로 확인한 버그).
 *
 * 다음 역 확인 전에는 그 역 도착 예상치 밑으로 내려가지 않는다. 그래서 지연된 열차는
 * "역 앞에서 멈춘 카운트다운"으로 보이고, 먼저 도착했다고 거짓말하지 않는다.
 */
export function liveRemainingSeconds(train: Train, nowMs: number): number | null {
  const { remainingSeconds, stationsAway, segmentStartedAtMs } = train;
  if (remainingSeconds === null) return null;
  if (stationsAway === null) return remainingSeconds;
  if (segmentStartedAtMs === undefined) return remainingSeconds;

  const floor = nextStationSeconds(remainingSeconds, stationsAway);
  const elapsed = Math.max(0, (nowMs - segmentStartedAtMs) / 1000);
  return Math.max(floor, remainingSeconds - elapsed);
}

/**
 * 지금 이 순간의 가상 위치 — 선택역까지 남은 정거장 수(0 = 도착, 1 = 전역).
 *
 * 남은 시간이 barvlDt에서 다음 역 예상치까지 줄어드는 비율만큼 한 정거장을 전진한다.
 * 정차(ARRIVED) 중에는 전진하지 않는다 — 서 있는 열차는 움직이지 않아야 하고,
 * 급행 대기 지연이 "그 역에 서 있는 점"으로 그대로 보이게 하기 위해서다.
 */
export function virtualGaps(train: Train, nowMs: number): number | null {
  const { remainingSeconds, stationsAway, status } = train;
  if (stationsAway === null) return null;
  if (status === 'ARRIVED') return stationsAway; // 정차 중 — 그 역에 그대로
  if (remainingSeconds === null) return stationsAway;

  const live = liveRemainingSeconds(train, nowMs);
  if (live === null) return stationsAway;

  const floor = nextStationSeconds(remainingSeconds, stationsAway);
  const span = remainingSeconds - floor;
  if (span <= 0) return stationsAway;

  const progress = Math.min(1, Math.max(0, (remainingSeconds - live) / span));
  const target = nextStationGaps(stationsAway);
  return stationsAway - progress * (stationsAway - target);
}

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

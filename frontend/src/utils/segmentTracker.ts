import type { Train, TrainsResponse, TrainStatus } from '../types/subway';
import { floorSecondsFor, learnPace, type PaceTable } from './paceTable';

/**
 * 구간 추적 — 폴링 응답을 비교해 각 열차의 카운트다운·이동에 필요한 기준 시각들을 붙인다.
 *
 * barvlDt는 구간(= ordkey 거리)에 들어선 시점의 값이고 구간 내내 얼어 있다. 그래서:
 * - 카운트다운 기준은 "구간에 들어선 시각"(segmentStartedAtMs). 거리가 바뀐 폴링에서 잡는다.
 * - 점의 이동 기준은 "움직이기 시작한 시각"(moveStartMs). 정차(도착) 중에는 시간이 흘러도
 *   점이 역에 서 있어야 하고, 출발이 관측되면 그 순간부터 남은 시간에 맞춰 이동해야 한다.
 *   이 구분이 없으면 정차 중 소모된 진행률만큼 출발 순간 점이 앞으로 확 뛴다(관측된 버그).
 * - 한 폴링에서 열차가 잠깐 사라졌다 다시 와도(수신 흔들림) 기준이 리셋되지 않도록
 *   앵커를 잠시 보존한다. 리셋되면 "구간 절반" 가정으로 되돌아가 점이 뒤로 뛴다.
 */
export type SegmentAnchor = {
  stationsAway: number;
  startedAtMs: number;
  status: TrainStatus;
  moveStartMs: number | null;
  moveStartRemainingSeconds: number | null;
  lastSeenMs: number;
  /** 구간 전이 때 직전 표시값과 이어붙이기 위해 보관한다. */
  remainingSeconds: number;
  floorSeconds: number;
};

export type AnchorMap = Map<string, SegmentAnchor>;

/** 사라진 열차의 앵커를 얼마나 보존할지. 폴링 몇 번의 수신 흔들림을 덮는다. */
const KEEP_UNSEEN_MS = 90_000;

/** 역(도착/진입)에 붙어 서 있어야 하는 상태인가. 내 역 진입(d=0)만은 이동으로 본다. */
function isParked(status: TrainStatus, stationsAway: number): boolean {
  if (status === 'ARRIVED') return true;
  return status === 'APPROACHING' && stationsAway > 0;
}

function liveAt(remainingSeconds: number, floor: number, startedAtMs: number, nowMs: number): number {
  const elapsed = Math.max(0, (nowMs - startedAtMs) / 1000);
  return Math.max(floor, remainingSeconds - elapsed);
}

export function trackSegments(
  response: TrainsResponse,
  prev: AnchorMap,
  pace: PaceTable,
  nowMs: number,
): { response: TrainsResponse; anchors: AnchorMap } {
  // 1) 이번 응답의 관측값으로 페이스 테이블부터 갱신한다 — 같은 응답의 뒤차가 바로 이득을 본다.
  for (const direction of response.directions) {
    for (const train of direction.trains) {
      learnPace(pace, direction.directionId, train.stationsAway, train.remainingSeconds, train.trainType);
    }
  }

  const anchors: AnchorMap = new Map();

  const directions = response.directions.map((direction) => ({
    ...direction,
    trains: direction.trains.map((train): Train => {
      const { trainId, stationsAway, remainingSeconds, status, trainType } = train;
      if (stationsAway === null || remainingSeconds === null) return train;

      const floor = floorSecondsFor(pace, direction.directionId, stationsAway, remainingSeconds, trainType);
      const old = prev.get(trainId);
      const parked = isParked(status, stationsAway);

      let startedAtMs: number;
      let moveStartMs: number | null;
      let moveStartRemainingSeconds: number | null;

      if (old && old.stationsAway === stationsAway) {
        // 같은 구간 — 카운트다운 기준 유지. (recptnDt가 갱신돼도 barvlDt는 그대로이므로
        // 여기서 기준을 다시 잡으면 시간이 도로 늘어난다.)
        startedAtMs = old.startedAtMs;

        const wasParked = isParked(old.status, old.stationsAway);
        if (parked) {
          moveStartMs = null;
          moveStartRemainingSeconds = null;
        } else if (wasParked || old.moveStartMs === null) {
          // 정차 → 출발을 방금 관측 — 지금 위치(역)에서 남은 시간으로 이동을 시작한다.
          moveStartMs = nowMs;
          moveStartRemainingSeconds = liveAt(remainingSeconds, floor, startedAtMs, nowMs);
        } else {
          moveStartMs = old.moveStartMs;
          moveStartRemainingSeconds = old.moveStartRemainingSeconds;
        }
      } else if (old) {
        // 구간 진입을 방금 관측 — 기준을 지금으로 잡되, 직전 화면이 보여주던 값과 이어붙인다.
        // 균등 분배 바닥이 실제 다음 barvlDt보다 살짝 낮으면(재생 검증에서 +2.3초 역행 관측)
        // 전이 순간 시간이 거꾸로 늘어난다. 직전 표시값이 새 barvlDt보다 작으면 그만큼
        // 기준을 과거로 물려 카운트다운이 직전 값에서 끊김 없이 이어지게 한다.
        const prevShown = liveAt(old.remainingSeconds, old.floorSeconds, old.startedAtMs, nowMs);
        const carryMs = prevShown < remainingSeconds ? (remainingSeconds - prevShown) * 1000 : 0;
        startedAtMs = nowMs - carryMs;
        moveStartMs = parked ? null : startedAtMs;
        moveStartRemainingSeconds = parked ? null : remainingSeconds;
      } else {
        // 처음 본 열차 — 구간 어디쯤인지 모르므로 절반쯤 왔다고 본다. 진입 직후로 보면
        // 최대 한 구간만큼 여유를 과대평가해 열차를 놓치는 쪽으로 틀리기 때문이다.
        const halfMs = ((remainingSeconds - floor) / 2) * 1000;
        startedAtMs = nowMs - Math.max(0, halfMs);
        moveStartMs = parked ? null : startedAtMs;
        moveStartRemainingSeconds = parked ? null : remainingSeconds;
      }

      anchors.set(trainId, {
        stationsAway,
        startedAtMs,
        status,
        moveStartMs,
        moveStartRemainingSeconds,
        lastSeenMs: nowMs,
        remainingSeconds,
        floorSeconds: floor,
      });

      return {
        ...train,
        segmentStartedAtMs: startedAtMs,
        floorSeconds: floor,
        moveStartMs: moveStartMs ?? undefined,
        moveStartRemainingSeconds: moveStartRemainingSeconds ?? undefined,
      };
    }),
  }));

  // 2) 이번 응답에 없는 열차의 앵커도 잠시 보존한다 — 수신 흔들림으로 잠깐 빠졌다 돌아올 때
  //    기준이 리셋돼 점이 뒤로 뛰는 것을 막는다.
  for (const [trainId, anchor] of prev) {
    if (!anchors.has(trainId) && nowMs - anchor.lastSeenMs < KEEP_UNSEEN_MS) {
      anchors.set(trainId, anchor);
    }
  }

  return { response: { ...response, directions }, anchors };
}

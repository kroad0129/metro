import { describe, expect, it } from 'vitest';
import type { Train, TrainsResponse, TrainStatus } from '../types/subway';
import { trackSegments } from './segmentTracker';
import type { PaceTable } from './paceTable';

const t0 = 1_000_000;

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: '9125',
    trainType: 'LOCAL',
    currentStation: { stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false },
    remainingSeconds: 225,
    status: 'TRAVELING' as TrainStatus,
    stationsAway: 2,
    recptnAt: '2026-07-23T13:57:02+09:00',
    ...over,
  };
}

function response(trains: Train[]): TrainsResponse {
  return {
    line: { id: '9', name: '서울 지하철 9호선' },
    station: { stationId: '1009000908', name: '증미', order: 8, isExpressStop: false },
    directions: [
      { directionId: 'UP', directionName: '개화 방면', trains },
      { directionId: 'DOWN', directionName: '중앙보훈병원 방면', trains: [] },
    ],
    updatedAt: new Date(t0).toISOString(),
    stale: false,
  };
}

function firstTrain(r: TrainsResponse): Train {
  return r.directions[0].trains[0];
}

describe('trackSegments', () => {
  it('처음 본 열차는 구간 절반쯤 왔다고 본다', () => {
    const { response: out } = trackSegments(response([train()]), new Map(), new Map(), t0);
    const annotated = firstTrain(out);
    // 균등 floor 112.5, span 112.5 → 절반 56.25초 전에 진입한 것으로
    expect(annotated.segmentStartedAtMs).toBeCloseTo(t0 - 56_250, -2);
    expect(annotated.floorSeconds).toBe(112.5);
  });

  it('같은 구간이면 기준을 유지한다 — recptnAt이 갱신돼도 카운트다운이 리셋되지 않는다', () => {
    const first = trackSegments(response([train()]), new Map(), new Map(), t0);
    const started = firstTrain(first.response).segmentStartedAtMs;

    const second = trackSegments(
      response([train({ recptnAt: '2026-07-23T13:57:30+09:00' })]),
      first.anchors,
      new Map(),
      t0 + 15_000,
    );
    expect(firstTrain(second.response).segmentStartedAtMs).toBe(started);
  });

  it('거리가 줄면 새 구간 — 기준을 지금으로 잡는다', () => {
    const first = trackSegments(response([train()]), new Map(), new Map(), t0);
    const second = trackSegments(
      response([train({ stationsAway: 1, remainingSeconds: 95 })]),
      first.anchors,
      new Map(),
      t0 + 130_000,
    );
    expect(firstTrain(second.response).segmentStartedAtMs).toBe(t0 + 130_000);
  });

  it('정차 → 출발 전이 순간의 남은 시간을 이동 시작점으로 기록한다', () => {
    const pace: PaceTable = new Map();
    const arrived = trackSegments(
      response([train({ stationsAway: 1, remainingSeconds: 95, status: 'ARRIVED' })]),
      new Map(),
      pace,
      t0,
    );
    expect(firstTrain(arrived.response).moveStartMs).toBeUndefined(); // 정차 중엔 이동 없음

    const departed = trackSegments(
      response([train({ stationsAway: 1, remainingSeconds: 95, status: 'DEPARTED' })]),
      arrived.anchors,
      pace,
      t0 + 30_000,
    );
    const annotated = firstTrain(departed.response);
    expect(annotated.moveStartMs).toBe(t0 + 30_000);
    // 출발 순간 = 구간 처음이므로 전체 소요(barvlDt 95)부터 센다. 정차 중에도 카운트다운은
    // 바닥으로 안 내려가고 95에 얼려 있으므로(대피 중 거짓 곧도착 방지), 출발할 때 95에서
    // 이어져 스냅이 없다 — 예전처럼 정차 중 소모된 값(27)에서 시작하지 않는다.
    expect(annotated.moveStartRemainingSeconds).toBe(95);
  });

  it('한 폴링에서 사라진 열차의 앵커를 잠시 보존한다 — 수신 흔들림에 기준이 리셋되지 않는다', () => {
    const first = trackSegments(response([train()]), new Map(), new Map(), t0);
    const started = firstTrain(first.response).segmentStartedAtMs;

    // 다음 폴링엔 안 보였다가
    const empty = trackSegments(response([]), first.anchors, new Map(), t0 + 15_000);
    // 그다음 폴링에 같은 구간으로 돌아오면 기준이 그대로다
    const back = trackSegments(response([train()]), empty.anchors, new Map(), t0 + 30_000);
    expect(firstTrain(back.response).segmentStartedAtMs).toBe(started);
  });

  it('같은 응답의 앞차 관측이 뒤차의 바닥에 바로 반영된다', () => {
    const leader = train({ trainId: 'L', stationsAway: 1, remainingSeconds: 95 });
    const follower = train({ trainId: 'F', stationsAway: 2, remainingSeconds: 225 });
    const { response: out } = trackSegments(response([leader, follower]), new Map(), new Map(), t0);
    const f = out.directions[0].trains.find((t) => t.trainId === 'F');
    expect(f?.floorSeconds).toBe(95); // 균등 112.5가 아니라 학습된 95
  });
});

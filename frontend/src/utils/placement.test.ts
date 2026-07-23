import { describe, expect, it } from 'vitest';
import type { Train } from '../types/subway';
import { assignLanes, segmentPercents, trainPlacement } from './placement';

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: '9127',
    trainType: 'LOCAL',
    currentStation: { stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false },
    remainingSeconds: 95,
    status: 'TRAVELING',
    positionRatio: 0.5,
    stationsAway: 1,
    recptnAt: '2026-07-23T13:57:02+09:00',
    ...over,
  };
}

describe('trainPlacement — API가 확실히 아는 것만 그린다 (구간은 3분할)', () => {
  it('정차(ARRIVED) 중이면 그 역 위에 선다', () => {
    expect(trainPlacement(train({ status: 'ARRIVED', stationsAway: 1 }))).toEqual({
      kind: 'station',
      gap: 1,
    });
    expect(trainPlacement(train({ status: 'ARRIVED', stationsAway: 0 }))).toEqual({
      kind: 'station',
      gap: 0,
    });
  });

  it('진입(APPROACHING)은 들어서는 역 직전 — 그 역으로 가는 구간의 마지막 ⅓이다', () => {
    // 전역 진입: 전전역→전역 구간의 끝자락
    expect(trainPlacement(train({ status: 'APPROACHING', stationsAway: 1 }))).toEqual({
      kind: 'segment',
      fromGap: 2,
      toGap: 1,
      phase: 'arrive',
    });
    // 내 역 진입: 전역→내 역 구간의 끝자락
    expect(trainPlacement(train({ status: 'APPROACHING', stationsAway: 0 }))).toEqual({
      kind: 'segment',
      fromGap: 1,
      toGap: 0,
      phase: 'arrive',
    });
  });

  it('출발(DEPARTED)은 떠난 역 직후 — 구간의 첫 ⅓이다', () => {
    expect(trainPlacement(train({ status: 'DEPARTED', stationsAway: 1 }))).toEqual({
      kind: 'segment',
      fromGap: 1,
      toGap: 0,
      phase: 'depart',
    });
  });

  it('운행중(TRAVELING)은 구간 가운데 ⅓이다', () => {
    expect(trainPlacement(train({ status: 'TRAVELING', stationsAway: 2 }))).toEqual({
      kind: 'segment',
      fromGap: 2,
      toGap: 1,
      phase: 'run',
    });
  });

  it('내 역을 출발(d=0, DEPARTED)한 열차는 배치하지 않는다', () => {
    expect(trainPlacement(train({ status: 'DEPARTED', stationsAway: 0 }))).toBeNull();
  });

  it('운행중인데 d=0인 비정상 조합은 내 역 진입으로 본다 — 열차를 잃지 않는다', () => {
    expect(trainPlacement(train({ status: 'TRAVELING', stationsAway: 0 }))).toEqual({
      kind: 'segment',
      fromGap: 1,
      toGap: 0,
      phase: 'arrive',
    });
  });

  it('거리를 모르면 배치하지 않는다', () => {
    expect(trainPlacement(train({ stationsAway: null }))).toBeNull();
  });
});

describe('segmentPercents — 구간의 해당 ⅓을 트랙 좌표(%)로', () => {
  it('전역→내 역 구간(트랙 오른쪽 절반)의 세 위상', () => {
    // 구간 [50%, 100%]를 3분할: 출발 [50, 66.7), 운행 [66.7, 83.3), 진입 [83.3, 100]
    const depart = segmentPercents(2, 1, 0, 'depart')!;
    const run = segmentPercents(2, 1, 0, 'run')!;
    const arrive = segmentPercents(2, 1, 0, 'arrive')!;
    expect(depart.left).toBeCloseTo(50);
    expect(run.left).toBeCloseTo(66.67, 1);
    expect(arrive.left).toBeCloseTo(83.33, 1);
    for (const p of [depart, run, arrive]) expect(p.width).toBeCloseTo(16.67, 1);
  });

  it('전전역→전역 구간은 트랙 왼쪽 절반을 3분할한다', () => {
    expect(segmentPercents(2, 2, 1, 'run')!.left).toBeCloseTo(16.67, 1);
  });

  it('트랙 밖에서 시작하는 구간은 그리지 않는다 — "다음 열차"로 처리된다', () => {
    expect(segmentPercents(2, 3, 2, 'run')).toBeNull();
  });

  it('트랙 끝 역에 진입 중이면 왼쪽 가장자리에 걸쳐 보인다 — 갑자기 튀어나오지 않게', () => {
    const edge = segmentPercents(2, 3, 2, 'arrive');
    expect(edge).not.toBeNull();
    expect(edge!.left).toBe(0);
    expect(edge!.width).toBeGreaterThan(0);
  });

  it('역이 하나뿐인 트랙(노선 끝)에는 구간이 없다', () => {
    expect(segmentPercents(0, 1, 0, 'run')).toBeNull();
  });
});

describe('assignLanes — 겹치는 열차는 아랫줄로', () => {
  it('겹치지 않으면 모두 첫 줄(0)이다', () => {
    expect(
      assignLanes([
        { start: 0, end: 20 },
        { start: 40, end: 60 },
        { start: 70, end: 90 },
      ]),
    ).toEqual([0, 0, 0]);
  });

  it('같은 자리를 차지하면(급행이 일반과 같은 구간) 둘째가 아랫줄로 간다', () => {
    expect(
      assignLanes([
        { start: 65, end: 85 },
        { start: 65, end: 85 },
      ]),
    ).toEqual([0, 1]);
  });

  it('사슬처럼 겹치면 비는 가장 윗줄을 쓴다 — A·C는 안 겹치므로 같은 줄', () => {
    expect(
      assignLanes([
        { start: 0, end: 30 },
        { start: 20, end: 50 },
        { start: 45, end: 70 },
      ]),
    ).toEqual([0, 1, 0]);
  });

  it('셋이 다 겹치면 세 줄이 된다', () => {
    expect(
      assignLanes([
        { start: 10, end: 90 },
        { start: 20, end: 80 },
        { start: 30, end: 70 },
      ]),
    ).toEqual([0, 1, 2]);
  });

  it('끝점이 닿기만 하는 것(인접 구간)은 겹침이 아니다', () => {
    expect(
      assignLanes([
        { start: 0, end: 50 },
        { start: 50, end: 100 },
      ]),
    ).toEqual([0, 0]);
  });
});

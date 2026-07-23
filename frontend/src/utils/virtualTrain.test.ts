import { describe, expect, it } from 'vitest';
import type { Train, TrainStatus } from '../types/subway';
import {
  leftPercentFromGaps,
  liveRemainingSeconds,
  nextStationSeconds,
  stallSeconds,
} from './virtualTrain';

const recptnAt = '2026-07-23T13:57:02+09:00';
const t0 = Date.parse(recptnAt);

function train(over: Partial<Train> = {}): Train {
  return {
    trainId: '9109',
    trainType: 'LOCAL',
    currentStation: { stationId: '1009000911', name: '신목동', order: 11, isExpressStop: false },
    remainingSeconds: 345,
    status: 'TRAVELING' as TrainStatus,
    positionRatio: 0.5,
    stationsAway: 3,
    recptnAt,
    segmentStartedAtMs: t0,
    ...over,
  };
}

describe('nextStationSeconds', () => {
  it('거리에 비례해 줄어든 값을 준다 — 실측과 맞는다', () => {
    // 실측: 7정거장 885초 → 6정거장에서 760초. 추정 758초.
    expect(nextStationSeconds(885, 7)).toBeCloseTo(758.6, 0);
    // 실측: 4정거장 485초 → 3정거장에서 345초. 추정 364초.
    expect(nextStationSeconds(485, 4)).toBeCloseTo(363.75, 1);
  });

  it('마지막 한 정거장은 0이 아니라 "내 역 진입" 값으로 둔다', () => {
    // 전역 95초 → 진입 시점 추정 19초(실측 20초)
    expect(nextStationSeconds(95, 1)).toBeCloseTo(19);
  });

  it('이미 도착했으면 0이다', () => {
    expect(nextStationSeconds(95, 0)).toBe(0);
  });
});

describe('liveRemainingSeconds', () => {
  it('구간 진입 시각 이후 흐른 만큼 뺀다', () => {
    expect(liveRemainingSeconds(train(), t0)).toBe(345);
    expect(liveRemainingSeconds(train(), t0 + 60_000)).toBe(285);
  });

  it('다음 역 예상치 밑으로는 내려가지 않는다 — 지연이어도 거짓 도착 없음', () => {
    const floor = nextStationSeconds(345, 3); // 230
    expect(liveRemainingSeconds(train(), t0 + 100_000)).toBeCloseTo(245);
    expect(liveRemainingSeconds(train(), t0 + 999_000)).toBeCloseTo(floor);
  });

  it('전역에서 오래 지연돼도 0으로 떨어지지 않는다', () => {
    const 전역 = train({ remainingSeconds: 95, stationsAway: 1 });
    expect(liveRemainingSeconds(전역, t0 + 999_000)).toBeCloseTo(19);
  });

  it('시계 오차로 now가 더 이르면 경과를 0으로 본다', () => {
    expect(liveRemainingSeconds(train(), t0 - 30_000)).toBe(345);
  });

  it('남은 시간을 모르면 null이다', () => {
    expect(liveRemainingSeconds(train({ remainingSeconds: null }), t0)).toBeNull();
  });

  it('구간 진입 시각을 모르면 보정 없이 원값을 쓴다', () => {
    expect(liveRemainingSeconds(train({ segmentStartedAtMs: undefined }), t0 + 60_000)).toBe(345);
  });

  it('학습된 floorSeconds가 있으면 균등 분배 대신 그걸 쓴다', () => {
    // 균등이면 floor=230이지만 학습값 225를 쓰면 실제 구간 소요와 맞는다
    const learned = train({ floorSeconds: 225 });
    expect(liveRemainingSeconds(learned, t0 + 999_000)).toBe(225);
  });

  it('recptnAt이 갱신돼도 남은 시간이 도로 늘어나지 않는다 (회귀 방지)', () => {
    // 서울시는 recptnDt를 10~27초마다 갱신하지만 barvlDt는 구간 내내 그대로다.
    // 기준을 recptnAt으로 잡으면 갱신될 때마다 카운트다운이 리셋된다.
    const before = liveRemainingSeconds(train(), t0 + 30_000);
    const afterRecptnBumped = liveRemainingSeconds(
      train({ recptnAt: '2026-07-23T13:57:30+09:00' }),
      t0 + 40_000,
    );
    expect(afterRecptnBumped!).toBeLessThan(before!);
  });
});

describe('stallSeconds', () => {
  it('추정 소요를 넘겨 같은 구간에 머물면 초과분이 지연이다', () => {
    // 345→230 구간(span 115초)을 다 썼고 30초 더 지났다
    expect(stallSeconds(train(), t0 + 145_000)).toBeCloseTo(30);
    expect(stallSeconds(train(), t0 + 60_000)).toBe(0); // 아직 예산 안
  });

  it('역에 서 있는 상태(도착·진입)는 지연이 아니다 — 배치 모델과 같은 기준', () => {
    expect(stallSeconds(train({ status: 'ARRIVED' }), t0 + 999_000)).toBe(0);
    expect(stallSeconds(train({ status: 'APPROACHING', stationsAway: 1 }), t0 + 999_000)).toBe(0);
    // 내 역 진입(d=0)도 화면에서는 역 위의 점 — 지연을 붙이지 않는다 (재생 검증에서 잡은 결함)
    expect(stallSeconds(train({ status: 'APPROACHING', stationsAway: 0 }), t0 + 999_000)).toBe(0);
  });
});

describe('leftPercentFromGaps', () => {
  it('선택역(0 gaps)은 100%, 트랙 왼쪽 끝(maxGaps)은 0%다', () => {
    expect(leftPercentFromGaps(2, 0)).toBe(100);
    expect(leftPercentFromGaps(2, 2)).toBe(0);
  });

  it('중간 위치를 선형으로 매핑한다', () => {
    expect(leftPercentFromGaps(2, 1)).toBe(50);
    expect(leftPercentFromGaps(2, 0.5)).toBe(75);
  });

  it('트랙보다 멀면 null — "다음 열차"로 처리된다', () => {
    expect(leftPercentFromGaps(2, 2.1)).toBeNull();
  });

  it('선택역을 지나간 열차는 null — 그리지 않는다', () => {
    expect(leftPercentFromGaps(2, -0.1)).toBeNull();
  });

  it('역이 하나뿐인 트랙(maxGaps 0)에서는 100%다', () => {
    expect(leftPercentFromGaps(0, 0)).toBe(100);
  });
});

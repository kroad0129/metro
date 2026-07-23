import { describe, expect, it } from 'vitest';
import type { Train, TrainStatus } from '../types/subway';
import {
  leftPercentFromGaps,
  liveRemainingSeconds,
  nextStationSeconds,
  virtualGaps,
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

describe('virtualGaps', () => {
  it('관측 직후에는 보고된 정거장 수 그대로다', () => {
    expect(virtualGaps(train(), t0)).toBe(3);
  });

  it('시간이 흐르면 한 정거장 안에서 전진한다', () => {
    // 345 → 230 구간(115초)의 절반이 지나면 0.5정거장 전진
    expect(virtualGaps(train(), t0 + 57_500)).toBeCloseTo(2.5);
  });

  it('다음 역 직전에서 멈춘다 — 확인 전엔 넘어가지 않는다', () => {
    expect(virtualGaps(train(), t0 + 999_000)).toBeCloseTo(2);
  });

  it('마지막 한 정거장은 역에 붙지 않고 코앞에서 멈춘다 — 거짓 도착 방지', () => {
    const 전역 = train({ remainingSeconds: 95, stationsAway: 1 });
    const gaps = virtualGaps(전역, t0 + 999_000);
    expect(gaps).toBeCloseTo(0.08);
    expect(gaps).toBeGreaterThan(0); // 아직 도착 아님
  });

  it('정차(ARRIVED) 중이면 시간이 흘러도 그 역에 서 있다', () => {
    const 정차 = train({ status: 'ARRIVED' });
    expect(virtualGaps(정차, t0 + 999_000)).toBe(3);
  });

  it('전역 진입(APPROACHING, d>0) 중에도 그 역에 붙는다 — 도착 직전 미세 이동은 그리지 않는다', () => {
    const 진입 = train({ status: 'APPROACHING', stationsAway: 1, remainingSeconds: 95 });
    expect(virtualGaps(진입, t0 + 60_000)).toBe(1);
  });

  it('출발이 관측되면 그 순간의 남은 시간부터 이동한다 — 정차 중 소모된 진행률로 점이 뛰지 않는다', () => {
    // 전역(d=1) barvlDt 95. 30초 정차 후 출발 관측: moveStart 시점 live = 65.
    const 출발 = train({
      status: 'DEPARTED',
      stationsAway: 1,
      remainingSeconds: 95,
      moveStartMs: t0 + 30_000,
      moveStartRemainingSeconds: 65,
      floorSeconds: 19,
    });
    // 출발 관측 직후: live=65 = moveStart값 → 진행률 0 → 아직 역(gap 1)에 있다
    expect(virtualGaps(출발, t0 + 30_000)).toBe(1);
    // 이후 절반(65→42) 지나면 절반쯤 전진
    const mid = virtualGaps(출발, t0 + 53_000);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0.08);
  });

  it('내 역 진입(d=0)은 코앞에서 문 앞으로 짧게 다가간다', () => {
    const 진입 = train({ status: 'APPROACHING', stationsAway: 0, remainingSeconds: 20, floorSeconds: 0 });
    const at0 = virtualGaps(진입, t0);
    const at15 = virtualGaps(진입, t0 + 15_000);
    expect(at0).toBeCloseTo(0.08);
    expect(at15).toBeLessThan(at0!);
    expect(at15).toBeGreaterThanOrEqual(0.02);
  });

  it('내 역을 출발(d=0, DEPARTED)한 열차는 음수 — 그리지 않는다', () => {
    const 통과 = train({ status: 'DEPARTED', stationsAway: 0 });
    expect(virtualGaps(통과, t0)).toBe(-1);
    expect(leftPercentFromGaps(2, -1)).toBeNull();
  });

  it('학습된 floorSeconds가 있으면 균등 분배 대신 그걸 쓴다', () => {
    // 균등이면 floor=230이지만 학습값 225를 쓰면 span이 실제 구간과 맞는다
    const learned = train({ floorSeconds: 225 });
    expect(liveRemainingSeconds(learned, t0 + 999_000)).toBe(225);
  });

  it('거리를 모르면 null이다 — 그리지 않는다', () => {
    expect(virtualGaps(train({ stationsAway: null }), t0)).toBeNull();
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

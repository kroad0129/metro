import { describe, expect, it } from 'vitest';
import {
  leftPercentFromGaps,
  phaseSegment,
  SECONDS_PER_GAP,
  virtualGaps,
  virtualRemainingSeconds,
} from './virtualTrain';

const t0 = 1_000_000;

describe('phaseSegment', () => {
  it('정차는 움직이지 않는다 — 출발 확인 전 자동 출발 금지', () => {
    expect(phaseSegment('ARRIVED', 1)).toEqual({ startGaps: 1, capGaps: 1, durationSeconds: 0 });
  });

  it('출발은 그 역 직후에서 다음 역 직전까지 간다', () => {
    const seg = phaseSegment('DEPARTED', 1);
    expect(seg.startGaps).toBeCloseTo(0.9);
    expect(seg.capGaps).toBeCloseTo(0.15);
  });

  it('진입은 역 코앞까지 짧게 간다', () => {
    const seg = phaseSegment('APPROACHING', 0);
    expect(seg.startGaps).toBeCloseTo(0.1);
    expect(seg.capGaps).toBeCloseTo(0.02);
  });

  it('운행은 그 역에서 다음 역 직전까지 간다', () => {
    const seg = phaseSegment('TRAVELING', 2);
    expect(seg.startGaps).toBe(2);
    expect(seg.capGaps).toBeCloseTo(1.15);
  });

  it('모든 위상의 페이스는 대략 한 정거장/110초로 균일하다 — 위상이 바뀌어도 속도가 튀지 않는다', () => {
    for (const status of ['DEPARTED', 'TRAVELING'] as const) {
      const seg = phaseSegment(status, 1);
      const pace = seg.durationSeconds / Math.abs(seg.startGaps - seg.capGaps);
      expect(pace).toBeGreaterThan(90);
      expect(pace).toBeLessThan(125);
    }
  });
});

describe('virtualGaps', () => {
  it('위상 시작 직후에는 시작점이다', () => {
    expect(virtualGaps('TRAVELING', 2, t0, t0)).toBe(2);
  });

  it('시간이 흐르면 선택역 쪽으로 전진한다', () => {
    const half = virtualGaps('TRAVELING', 2, t0, t0 + 47_000); // 94초의 절반
    expect(half).toBeCloseTo(2 - 0.85 / 2, 5);
  });

  it('시간이 다 지나도 상한(cap)을 넘지 않는다 — 확인 전 다음 역에 못 간다', () => {
    expect(virtualGaps('TRAVELING', 2, t0, t0 + 500_000)).toBeCloseTo(1.15);
    expect(virtualGaps('DEPARTED', 1, t0, t0 + 500_000)).toBeCloseTo(0.15);
  });

  it('정차는 아무리 지나도 그 자리다', () => {
    expect(virtualGaps('ARRIVED', 1, t0, t0 + 500_000)).toBe(1);
  });

  it('앵커가 없으면(처음 본 열차) 위상 시작점에 둔다', () => {
    expect(virtualGaps('TRAVELING', 2, undefined, t0 + 500_000)).toBe(2);
  });
});

describe('virtualRemainingSeconds', () => {
  it('남은 정거장 수에 페이스를 곱한다', () => {
    expect(virtualRemainingSeconds(2)).toBe(2 * SECONDS_PER_GAP);
    expect(virtualRemainingSeconds(1)).toBe(SECONDS_PER_GAP);
  });

  it('0 밑으로 내려가지 않는다', () => {
    expect(virtualRemainingSeconds(-0.1)).toBe(0);
  });

  it('전역(1정거장)은 약 2분으로 — 운영사 추정(95초)과 같은 자리다', () => {
    const seconds = virtualRemainingSeconds(1);
    expect(seconds).toBeGreaterThan(60);
    expect(seconds).toBeLessThan(180);
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

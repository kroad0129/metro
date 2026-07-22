import { describe, expect, it } from 'vitest';
import type { Station, Train } from '../types/subway';
import { buildTrack, formatRemaining, remainingAt, trainLeftPercent, TRACK_SPAN } from './trackPosition';

const stations: Station[] = Array.from({ length: 38 }, (_, i) => ({
  stationId: `${1009000900 + i + 1}`,
  name: `역${i + 1}`,
  order: i + 1,
  isExpressStop: false,
}));

const 증미 = stations[7];   // order 8
const 개화 = stations[0];   // order 1
const 중앙보훈병원 = stations[37]; // order 38

function trainAt(station: Station, positionRatio: number): Train {
  return {
    trainId: 'T',
    trainType: 'LOCAL',
    currentStation: station,
    remainingSeconds: 120,
    status: 'TRAVELING',
    positionRatio,
  };
}

describe('buildTrack', () => {
  it('기본 구간 길이는 4다', () => {
    expect(TRACK_SPAN).toBe(4);
  });

  it('UP 방향은 order가 큰 역에서 시작해 선택역으로 끝난다', () => {
    const track = buildTrack(stations, 증미, 'UP');
    expect(track.map((s) => s.order)).toEqual([12, 11, 10, 9, 8]);
  });

  it('DOWN 방향은 order가 작은 역에서 시작해 선택역으로 끝난다', () => {
    const track = buildTrack(stations, 증미, 'DOWN');
    expect(track.map((s) => s.order)).toEqual([4, 5, 6, 7, 8]);
  });

  it('두 방향 모두 마지막 원소가 선택한 역이다', () => {
    expect(buildTrack(stations, 증미, 'UP').at(-1)?.order).toBe(8);
    expect(buildTrack(stations, 증미, 'DOWN').at(-1)?.order).toBe(8);
  });

  it('노선 끝에서는 있는 역만큼만 담는다', () => {
    expect(buildTrack(stations, 개화, 'DOWN').map((s) => s.order)).toEqual([1]);
    expect(buildTrack(stations, 중앙보훈병원, 'UP').map((s) => s.order)).toEqual([38]);
  });

  it('구간 길이를 조정할 수 있다', () => {
    expect(buildTrack(stations, 증미, 'UP', 2).map((s) => s.order)).toEqual([10, 9, 8]);
  });
});

describe('trainLeftPercent', () => {
  const track = buildTrack(stations, 증미, 'UP'); // [12, 11, 10, 9, 8]

  it('트랙 왼쪽 끝의 열차는 0%다', () => {
    expect(trainLeftPercent(track, trainAt(stations[11], 0))).toBe(0);
  });

  it('선택역에 도착한 열차는 100%다', () => {
    expect(trainLeftPercent(track, trainAt(증미, 0))).toBe(100);
  });

  it('positionRatio만큼 오른쪽으로 이동한다', () => {
    // index 3(order 9) + 0.5 = 3.5, 트랙 간격 4개 → 87.5%
    expect(trainLeftPercent(track, trainAt(stations[8], 0.5))).toBe(87.5);
  });

  it('트랙 밖의 역에 있는 열차는 null이다', () => {
    expect(trainLeftPercent(track, trainAt(stations[20], 0.5))).toBeNull();
  });

  it('100%를 넘지 않도록 자른다', () => {
    expect(trainLeftPercent(track, trainAt(증미, 0.75))).toBe(100);
  });

  it('역이 하나뿐인 트랙에서는 100%를 반환한다', () => {
    const single = buildTrack(stations, 개화, 'DOWN');
    expect(trainLeftPercent(single, trainAt(개화, 0))).toBe(100);
  });
});

describe('formatRemaining', () => {
  it('1분 미만은 초로 표시한다', () => {
    expect(formatRemaining(45)).toBe('45초');
  });

  it('1분 이상이면서 초가 남으면 분과 초를 함께 표시한다', () => {
    expect(formatRemaining(385)).toBe('6분 25초');
    expect(formatRemaining(125)).toBe('2분 5초');
  });

  it('정확히 나누어떨어지는 분은 초를 생략한다', () => {
    expect(formatRemaining(60)).toBe('1분');
    expect(formatRemaining(180)).toBe('3분');
  });

  it('알 수 없으면 대시로 표시한다', () => {
    expect(formatRemaining(null)).toBe('—');
  });

  it('0 이하는 곧 도착으로 표시한다', () => {
    expect(formatRemaining(0)).toBe('곧 도착');
    expect(formatRemaining(-30)).toBe('곧 도착');
  });
});

describe('remainingAt', () => {
  const updatedAt = '2026-07-22T14:00:00+09:00';
  const updatedMs = new Date(updatedAt).getTime();

  it('경과한 만큼 초를 뺀다', () => {
    expect(remainingAt(120, updatedAt, updatedMs + 25_000)).toBe(95);
  });

  it('1초 미만의 경과는 버림한다', () => {
    expect(remainingAt(120, updatedAt, updatedMs + 999)).toBe(120);
  });

  it('0 밑으로는 내려가지 않는다', () => {
    expect(remainingAt(10, updatedAt, updatedMs + 60_000)).toBe(0);
  });

  it('remainingSeconds가 null이면 null을 반환한다', () => {
    expect(remainingAt(null, updatedAt, updatedMs)).toBeNull();
  });

  it('updatedAtIso가 잘못되면 null을 반환한다', () => {
    expect(remainingAt(120, 'not-a-date', updatedMs)).toBeNull();
  });

  it('시계 오차로 now가 더 이르면 경과를 0으로 취급한다', () => {
    expect(remainingAt(120, updatedAt, updatedMs - 5_000)).toBe(120);
  });
});

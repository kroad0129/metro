import { describe, expect, it } from 'vitest';
import type { Station } from '../types/subway';
import { buildTrack, formatRemaining, TRACK_SPAN } from './trackPosition';

const stations: Station[] = Array.from({ length: 38 }, (_, i) => ({
  stationId: `${1009000900 + i + 1}`,
  name: `역${i + 1}`,
  order: i + 1,
  isExpressStop: false,
}));

const 증미 = stations[7]; // order 8
const 개화 = stations[0]; // order 1
const 중앙보훈병원 = stations[37]; // order 38

describe('buildTrack', () => {
  it('기본 구간 길이는 2다', () => {
    expect(TRACK_SPAN).toBe(2);
  });

  it('UP 방향은 order가 큰 역에서 시작해 선택역으로 끝난다', () => {
    const track = buildTrack(stations, 증미, 'UP');
    expect(track.map((s) => s.order)).toEqual([10, 9, 8]);
  });

  it('DOWN 방향은 order가 작은 역에서 시작해 선택역으로 끝난다', () => {
    const track = buildTrack(stations, 증미, 'DOWN');
    expect(track.map((s) => s.order)).toEqual([6, 7, 8]);
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
    expect(buildTrack(stations, 증미, 'UP', 4).map((s) => s.order)).toEqual([12, 11, 10, 9, 8]);
  });
});

describe('formatRemaining', () => {
  it('분과 초를 함께 보여준다 — 매초 흐르는 게 보이게', () => {
    expect(formatRemaining(110)).toBe('1분 50초');
    expect(formatRemaining(220)).toBe('3분 40초');
    expect(formatRemaining(61)).toBe('1분 1초');
  });

  it('딱 나누어떨어지는 분은 초를 생략한다', () => {
    expect(formatRemaining(120)).toBe('2분');
  });

  it('1분 미만은 초만 보여준다', () => {
    expect(formatRemaining(45)).toBe('45초');
    expect(formatRemaining(59.4)).toBe('59초');
  });

  it('소수 초는 반올림한다(가상 모델이 실수를 준다)', () => {
    expect(formatRemaining(93.5)).toBe('1분 34초');
  });

  it('알 수 없으면 대시로 표시한다', () => {
    expect(formatRemaining(null)).toBe('—');
  });

  it('0 이하는 곧 도착으로 표시한다', () => {
    expect(formatRemaining(0)).toBe('곧 도착');
    expect(formatRemaining(-30)).toBe('곧 도착');
  });
});

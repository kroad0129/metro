import { describe, expect, it } from 'vitest';
import { floorSecondsFor, learnPace, type PaceTable } from './paceTable';

describe('learnPace / floorSecondsFor', () => {
  it('관측한 barvlDt를 기록하고, 뒤차의 바닥으로 쓴다', () => {
    const table: PaceTable = new Map();
    // 앞차가 전역(d=1)에서 95초를 보고했다
    learnPace(table, 'UP', 1, 95, 'LOCAL');
    // 뒤차(d=2, 225초)의 바닥은 균등 분배(112.5)가 아니라 학습된 95다
    expect(floorSecondsFor(table, 'UP', 2, 225, 'LOCAL')).toBe(95);
  });

  it('학습값이 없으면 균등 분배로 추정한다', () => {
    const table: PaceTable = new Map();
    expect(floorSecondsFor(table, 'UP', 2, 225, 'LOCAL')).toBe(112.5);
    // 마지막 구간(d=1)은 진입 시점 값(20%)에서 멈춘다
    expect(floorSecondsFor(table, 'UP', 1, 95, 'LOCAL')).toBeCloseTo(19);
  });

  it('방향이 다르면 섞이지 않는다', () => {
    const table: PaceTable = new Map();
    learnPace(table, 'UP', 1, 95, 'LOCAL');
    expect(floorSecondsFor(table, 'DOWN', 2, 225, 'LOCAL')).toBe(112.5);
  });

  it('급행은 배우지도, 학습값을 쓰지도 않는다 — 정차 패턴이 다르다', () => {
    const table: PaceTable = new Map();
    learnPace(table, 'UP', 1, 60, 'EXPRESS'); // 무시된다
    expect(table.size).toBe(0);
    learnPace(table, 'UP', 1, 95, 'LOCAL');
    expect(floorSecondsFor(table, 'UP', 2, 200, 'EXPRESS')).toBe(100); // 균등 분배
  });

  it('학습값이 barvlDt보다 크면(비정상) 무시하고 균등 분배로 돌아간다', () => {
    const table: PaceTable = new Map();
    learnPace(table, 'UP', 1, 300, 'LOCAL');
    expect(floorSecondsFor(table, 'UP', 2, 225, 'LOCAL')).toBe(112.5);
  });

  it('null·급행·0 이하 값은 배우지 않는다', () => {
    const table: PaceTable = new Map();
    learnPace(table, 'UP', null, 95, 'LOCAL');
    learnPace(table, 'UP', 1, null, 'LOCAL');
    learnPace(table, 'UP', 1, 0, 'LOCAL');
    expect(table.size).toBe(0);
  });

  it('내 역 진입값(d=0)도 배워 마지막 구간의 바닥으로 쓴다', () => {
    const table: PaceTable = new Map();
    learnPace(table, 'UP', 0, 20, 'LOCAL');
    expect(floorSecondsFor(table, 'UP', 1, 95, 'LOCAL')).toBe(20);
  });
});

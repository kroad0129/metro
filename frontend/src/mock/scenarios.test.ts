import { describe, expect, it } from 'vitest';
import { DELAY_NOTICE_SECONDS, stallSeconds } from '../utils/virtualTrain';
import { combineScenarios, MOCK_SELECTED, MOCK_STATIONS, SCENARIOS } from './scenarios';

const base = Date.parse('2026-07-23T20:00:00+09:00');

describe('목업 시나리오', () => {
  it('시나리오 id는 유일하다', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('전부 합쳐도 trainId가 겹치지 않는다 — React key와 레인 배정이 꼬이지 않게', () => {
    const { up, down } = combineScenarios(
      SCENARIOS.map((s) => s.id),
      base,
    );
    const ids = [...up.trains, ...down.trains].map((t) => t.trainId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(10);
  });

  it('목업 역 목록에 선택역(증미)이 있고 order로 이어져 있다', () => {
    expect(MOCK_STATIONS.some((s) => s.stationId === MOCK_SELECTED.stationId)).toBe(true);
    const orders = MOCK_STATIONS.map((s) => s.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('"지연" 시나리오의 열차는 실제로 지연 배지 임계를 넘는다', () => {
    const { up } = combineScenarios(['지연'], base);
    expect(up.trains).toHaveLength(1);
    expect(stallSeconds(up.trains[0], base)).toBeGreaterThan(DELAY_NOTICE_SECONDS);
  });

  it('"겹침-구간"은 같은 구간을 달리는 일반+급행이다', () => {
    const { up } = combineScenarios(['겹침-구간'], base);
    expect(up.trains).toHaveLength(2);
    const types = up.trains.map((t) => t.trainType).sort();
    expect(types).toEqual(['EXPRESS', 'LOCAL']);
    expect(up.trains[0].stationsAway).toBe(up.trains[1].stationsAway);
  });

  it('"운행종료"는 열차 없이 양방향에 첫차 안내를 단다', () => {
    const { up, down } = combineScenarios(['운행종료'], base);
    expect(up.trains).toHaveLength(0);
    expect(up.nextSchedule?.firstOfDay).toBe(true);
    expect(down.nextSchedule?.firstOfDay).toBe(true);
  });

  it('"안내실패"는 시간표 조회 실패(null)를 흉내낸다', () => {
    const { up } = combineScenarios(['안내실패'], base);
    expect(up.nextSchedule).toBeNull();
  });
});

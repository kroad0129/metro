import { positionRatioOf } from './train-position';

describe('positionRatioOf', () => {
  it('역에 도착한 열차는 0', () => {
    expect(positionRatioOf('ARRIVED')).toBe(0);
  });

  it('역을 출발한 열차는 0.25', () => {
    expect(positionRatioOf('DEPARTED')).toBe(0.25);
  });

  it('역 사이를 이동 중인 열차는 0.5', () => {
    expect(positionRatioOf('TRAVELING')).toBe(0.5);
  });

  it('다음 역에 진입 중인 열차는 0.75', () => {
    expect(positionRatioOf('APPROACHING')).toBe(0.75);
  });

  it('모든 값은 0 이상 1 미만이다', () => {
    const all = (['ARRIVED', 'DEPARTED', 'TRAVELING', 'APPROACHING'] as const).map(positionRatioOf);
    for (const ratio of all) {
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThan(1);
    }
  });
});

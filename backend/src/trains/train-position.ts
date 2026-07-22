import { TrainStatus } from './types';

/**
 * currentStation을 기준으로 진행 방향(선택한 역 쪽)으로 얼마나 갔는지를 0~1 미만으로 나타낸다.
 * 스펙 6.4절 표를 그대로 구현한 것이다.
 *
 * 주의: APPROACHING은 "currentStation을 지나 다음 역에 접근 중"으로 해석한다.
 * 서울시 API의 진입 코드가 실제로 어느 역 기준인지는 확인되지 않았다(스펙 2절 2번).
 * 사용자가 실제로 보고 판단하는 값은 remainingSeconds이므로, 한 구간 이내의
 * 위치 오차는 MVP에서 허용한다.
 */
const RATIO: Record<TrainStatus, number> = {
  ARRIVED: 0,
  DEPARTED: 0.25,
  TRAVELING: 0.5,
  APPROACHING: 0.75,
};

export function positionRatioOf(status: TrainStatus): number {
  return RATIO[status];
}

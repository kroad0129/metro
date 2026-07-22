export type DirectionId = 'UP' | 'DOWN';

export type Station = {
  stationId: string;
  name: string;
  order: number;
  /**
   * 급행 정차 여부. 정보 제공용으로만 쓰인다 — 값은 공식 자료로 검증되지 않았고
   * (일반 지식으로 작성됨), 현재 이 값에 근거해 열차를 걸러내는 로직은 없다.
   */
  isExpressStop: boolean;
};

export type Line = {
  lineId: string;
  lineName: string;
  /** 서울시 실시간 도착정보 API의 subwayId (예: 9호선 = "1009"). 환승역 응답에서 다른 노선의 열차를 걸러내는 데 사용한다. */
  externalLineId: string;
  stations: Station[];
};

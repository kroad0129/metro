export type DirectionId = 'UP' | 'DOWN';

export type Station = {
  stationId: string;
  name: string;
  order: number;
  isExpressStop: boolean;
};

export type Line = {
  lineId: string;
  lineName: string;
  /** 서울시 실시간 도착정보 API의 subwayId (예: 9호선 = "1009"). 환승역 응답에서 다른 노선의 열차를 걸러내는 데 사용한다. */
  externalLineId: string;
  stations: Station[];
};

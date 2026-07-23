export type DirectionId = 'UP' | 'DOWN';
export type TrainType = 'EXPRESS' | 'LOCAL';
export type TrainStatus = 'ARRIVED' | 'DEPARTED' | 'TRAVELING' | 'APPROACHING';

export type Station = {
  stationId: string;
  name: string;
  order: number;
  isExpressStop: boolean;
};

export type Train = {
  trainId: string;
  trainType: TrainType;
  currentStation: Station;
  remainingSeconds: number | null;
  status: TrainStatus;
  positionRatio: number;
  /** 선택역까지 남은 정거장 수(ordkey에서 추출). 위치의 기준. */
  stationsAway: number | null;
  /** remainingSeconds가 산출된 시각(ISO). 여기서부터 카운트다운한다(벤더 지침). */
  recptnAt: string | null;
};

export type DirectionBlock = {
  directionId: DirectionId;
  directionName: string;
  trains: Train[];
};

export type TrainsResponse = {
  line: { id: string; name: string };
  station: Station;
  directions: DirectionBlock[];
  updatedAt: string;
  stale: boolean;
};

export type StationsResponse = {
  lineId: string;
  lineName: string;
  stations: Station[];
};

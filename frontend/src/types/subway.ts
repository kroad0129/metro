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
  /** 이 위상(현재역+상태)을 처음 관측한 시각(ms). useTrainData가 폴링마다 채운다 —
   *  가상 열차 모델(virtualTrain)이 여기서부터 위치를 전진시킨다. 백엔드 응답에는 없다. */
  anchorSinceMs?: number;
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

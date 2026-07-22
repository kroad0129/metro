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

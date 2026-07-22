import { DirectionId, Station } from '../lines/types';

export type TrainType = 'EXPRESS' | 'LOCAL';
export type TrainStatus = 'ARRIVED' | 'DEPARTED' | 'TRAVELING' | 'APPROACHING';

/** 외부 응답을 변환한 직후 상태. 현재 위치가 아직 역 "이름" 문자열이다. */
export type RawTrain = {
  trainId: string;
  trainType: TrainType;
  currentStationName: string;
  remainingSeconds: number | null;
  status: TrainStatus;
  directionId: DirectionId;
};

/** 역 매칭까지 끝난 최종 형태. */
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

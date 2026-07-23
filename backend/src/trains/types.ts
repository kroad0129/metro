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
  /** 조회한 역까지 남은 정거장 수(ordkey에서 추출). 형식이 어긋나면 null. */
  stationsAway: number | null;
  /** remainingSeconds가 산출된 시각(ISO, KST). 이후 흐른 만큼 빼서 써야 한다. */
  recptnAt: string | null;
};

/** 역 매칭까지 끝난 최종 형태. */
export type Train = {
  trainId: string;
  trainType: TrainType;
  currentStation: Station;
  remainingSeconds: number | null;
  status: TrainStatus;
  positionRatio: number;
  /** 조회한 역까지 남은 정거장 수. 화면이 위치를 그릴 때 쓰는 기준. */
  stationsAway: number | null;
  /** remainingSeconds 기준 시각(ISO). 화면이 여기서부터 카운트다운한다. */
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

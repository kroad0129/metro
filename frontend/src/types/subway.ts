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
  /** 선택역까지 남은 정거장 수(ordkey에서 추출). 위치의 기준. */
  stationsAway: number | null;
  /** remainingSeconds가 산출된 시각(ISO). */
  recptnAt: string | null;
  /**
   * 이 열차가 지금 구간(= 현재 stationsAway)에 들어온 시각(ms). segmentTracker가 거리 변화를
   * 관측해 채운다. barvlDt는 구간 진입 시점 값 그대로라, 카운트다운은 recptnAt이 아니라
   * 이 시각을 기준으로 해야 한다. 백엔드 응답에는 없다(이하 세 필드도 마찬가지).
   */
  segmentStartedAtMs?: number;
  /** 카운트다운 바닥 — 다음 구간에 들어설 때 barvlDt가 될 값(페이스 테이블에서 학습). */
  floorSeconds?: number;
  /** 이 구간에서 움직이기 시작한 시각(ms). 정차 중이면 없다. */
  moveStartMs?: number;
  /** 움직이기 시작한 순간의 남은 시간(초). 점 이동 진행률의 시작점. */
  moveStartRemainingSeconds?: number;
};

export type DirectionBlock = {
  directionId: DirectionId;
  directionName: string;
  trains: Train[];
  /** 접근 중인 열차가 없을 때의 시간표 기준 다음 출발(심야·막차 안내). 조회 실패면 null. */
  nextSchedule?: { departureAt: string; firstOfDay: boolean } | null;
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

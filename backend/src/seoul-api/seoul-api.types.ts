/** 서울 열린데이터광장 realtimeStationArrival 응답. 필드는 미검증(스펙 2절 1번). */
export type SeoulArrivalItem = {
  /**
   * "상행" | "하행" — 실사용 금지. 실제 응답을 확인한 결과 이 프로젝트의 UP(=개화 방면, order 감소)
   * 정의와 반대로 라벨링되어 있고("하행"인데 개화행), 형제 API인 realtimePosition은 같은 물리적
   * 방향을 반대로 표기한다. 방향은 반드시 statnFid/statnTid로 판단한다. 문서화 목적으로만 남겨둔다.
   */
  updnLine?: string;
  trainLineNm?: string; // "개화행 - 등촌방면"
  subwayId?: string; // 노선 ID (9호선 = "1009"). 환승역에서는 다른 노선 값도 섞여 온다.
  statnNm?: string; // 조회한 역
  statnId?: string; // 조회한 역(질의한 역)의 ID
  statnFid?: string; // 열차의 이전지하철역ID (진행 방향 기준) — 방향 판단에 사용
  statnTid?: string; // 열차의 다음지하철역ID (진행 방향 기준) — 방향 판단에 사용
  btrainSttus?: string; // "급행" | "일반" | "특급"
  btrainNo?: string; // 열차번호
  bstatnNm?: string; // 종착역
  barvlDt?: string; // 도착예정 초. "0"이면 미제공
  arvlMsg2?: string;
  arvlMsg3?: string; // 현재 열차가 있는 역명
  arvlCd?: string; // 0진입 1도착 2출발 3전역출발 4전역진입 5전역도착 99운행중
};

export type SeoulArrivalResponse = {
  errorMessage?: {
    status?: number;
    code?: string;
    message?: string;
    total?: number;
  };
  realtimeArrivalList?: SeoulArrivalItem[];
};

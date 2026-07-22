/** 서울 열린데이터광장 realtimeStationArrival 응답. 필드는 미검증(스펙 2절 1번). */
export type SeoulArrivalItem = {
  subwayId?: string;
  updnLine?: string;      // "상행" | "하행"
  trainLineNm?: string;   // "개화행 - 등촌방면"
  statnNm?: string;       // 조회한 역
  btrainSttus?: string;   // "급행" | "일반" | "특급"
  btrainNo?: string;      // 열차번호
  bstatnNm?: string;      // 종착역
  barvlDt?: string;       // 도착예정 초. "0"이면 미제공
  arvlMsg2?: string;
  arvlMsg3?: string;      // 현재 열차가 있는 역명
  arvlCd?: string;        // 0진입 1도착 2출발 3전역출발 4전역진입 5전역도착 99운행중
};

export type SeoulArrivalResponse = {
  errorMessage?: { status?: number; code?: string; message?: string; total?: number };
  realtimeArrivalList?: SeoulArrivalItem[];
};

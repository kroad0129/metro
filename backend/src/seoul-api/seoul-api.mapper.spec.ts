import { mapArrivalResponse } from './seoul-api.mapper';
import { SeoulArrivalResponse } from './seoul-api.types';
import jeungmi from '../../test/fixtures/station-arrival.success.json';
import gayang from '../../test/fixtures/station-arrival.express.json';
import empty from '../../test/fixtures/station-arrival.empty.json';

describe('mapArrivalResponse', () => {
  it('열차 4대를 모두 변환한다', () => {
    expect(mapArrivalResponse(jeungmi)).toHaveLength(4);
  });

  it('열차번호를 trainId로 옮긴다', () => {
    const [first] = mapArrivalResponse(jeungmi);
    expect(first.trainId).toBe('9129');
  });

  describe('방향 판단 (statnId vs statnTid)', () => {
    it('statnTid가 statnId보다 작으면 UP이다 (증미: 개화행)', () => {
      const trains = mapArrivalResponse(jeungmi);
      expect(trains[0].directionId).toBe('UP');
      expect(trains[1].directionId).toBe('UP');
    });

    it('statnTid가 statnId보다 크면 DOWN이다 (증미: 중앙보훈병원행)', () => {
      const trains = mapArrivalResponse(jeungmi);
      expect(trains[2].directionId).toBe('DOWN');
      expect(trains[3].directionId).toBe('DOWN');
    });

    it('가양(statnId 1009000907): 개화행/김포공항행은 statnTid 1009000906 → UP', () => {
      const trains = mapArrivalResponse(gayang);
      expect(trains[0].directionId).toBe('UP');
      expect(trains[1].directionId).toBe('UP');
    });

    it('가양(statnId 1009000907): 중앙보훈병원행은 statnTid 1009000908 → DOWN', () => {
      const trains = mapArrivalResponse(gayang);
      expect(trains[2].directionId).toBe('DOWN');
      expect(trains[3].directionId).toBe('DOWN');
    });

    it('updnLine은 신뢰할 수 없으므로 사용하지 않는다: 상행이 실제로는 DOWN으로 매핑되는 예시', () => {
      // jeungmi rows 3,4 have updnLine "상행" but head toward 중앙보훈병원 (order 증가) → DOWN
      const raw = jeungmi as unknown as SeoulArrivalResponse;
      expect(raw.realtimeArrivalList?.[2].updnLine).toBe('상행');
      expect(mapArrivalResponse(jeungmi)[2].directionId).toBe('DOWN');
    });

    it('statnId와 statnTid가 같으면 방향을 알 수 없어 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            statnId: '1009000908',
            statnTid: '1009000908',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw)).toEqual([]);
    });

    it('statnId 또는 statnTid가 없으면 방향을 알 수 없어 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            statnId: '1009000908',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw)).toEqual([]);
    });

    it('statnId 또는 statnTid가 숫자가 아니면 방향을 알 수 없어 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            statnId: 'abc',
            statnTid: '1009000908',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw)).toEqual([]);
    });
  });

  it('급행을 EXPRESS, 일반을 LOCAL로 매핑한다', () => {
    const trains = mapArrivalResponse(gayang);
    expect(trains[0].trainType).toBe('LOCAL');
    expect(trains[1].trainType).toBe('EXPRESS');
    expect(trains[3].trainType).toBe('EXPRESS');
  });

  it('arvlMsg3를 현재 위치 역명으로 옮긴다', () => {
    const trains = mapArrivalResponse(jeungmi);
    expect(trains[0].currentStationName).toBe('신목동');
    expect(trains[1].currentStationName).toBe('노량진');
  });

  it('barvlDt를 초 단위 숫자로 변환한다', () => {
    expect(mapArrivalResponse(jeungmi)[0].remainingSeconds).toBe(345);
  });

  it('barvlDt가 "0"이면 remainingSeconds는 null이다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        {
          statnId: '1009000908',
          statnTid: '1009000907',
          btrainSttus: '일반',
          btrainNo: '1',
          barvlDt: '0',
          arvlMsg3: '등촌',
          arvlCd: '2',
        },
      ],
    };
    expect(mapArrivalResponse(raw)[0].remainingSeconds).toBeNull();
  });

  describe('arvlCd → status', () => {
    function itemWith(arvlCd: string) {
      return {
        statnId: '1009000908',
        statnTid: '1009000907',
        btrainSttus: '일반',
        btrainNo: '1',
        barvlDt: '10',
        arvlMsg3: '등촌',
        arvlCd,
      };
    }

    it('0 진입 → APPROACHING', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('0')],
      };
      expect(mapArrivalResponse(raw)[0].status).toBe('APPROACHING');
    });

    it('1 도착 → ARRIVED', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('1')],
      };
      expect(mapArrivalResponse(raw)[0].status).toBe('ARRIVED');
    });

    it('2 출발 → DEPARTED', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('2')],
      };
      expect(mapArrivalResponse(raw)[0].status).toBe('DEPARTED');
    });

    it('3 전역출발 → DEPARTED (가양 실데이터)', () => {
      expect(mapArrivalResponse(gayang)[2].status).toBe('DEPARTED');
    });

    it('4 전역진입 → APPROACHING', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('4')],
      };
      expect(mapArrivalResponse(raw)[0].status).toBe('APPROACHING');
    });

    it('5 전역도착 → ARRIVED', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('5')],
      };
      expect(mapArrivalResponse(raw)[0].status).toBe('ARRIVED');
    });

    it('99 운행중 → TRAVELING (증미 실데이터)', () => {
      expect(mapArrivalResponse(jeungmi)[0].status).toBe('TRAVELING');
    });

    it('알 수 없는 arvlCd는 TRAVELING으로 처리한다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('77')],
      };
      expect(mapArrivalResponse(raw)[0].status).toBe('TRAVELING');
    });
  });

  it('빈 응답은 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse(empty)).toEqual([]);
  });

  it('realtimeArrivalList가 아예 없어도 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse({})).toEqual([]);
  });

  it('현재 위치 역명이 없는 항목은 버린다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        {
          statnId: '1009000908',
          statnTid: '1009000907',
          btrainSttus: '일반',
          btrainNo: '1',
          barvlDt: '10',
          arvlCd: '1',
        },
      ],
    };
    expect(mapArrivalResponse(raw)).toEqual([]);
  });

  it('열차번호가 없으면 방향과 위치로 안정적인 id를 만든다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        {
          statnId: '1009000908',
          statnTid: '1009000907',
          btrainSttus: '일반',
          barvlDt: '10',
          arvlMsg3: '등촌',
          arvlCd: '1',
        },
      ],
    };
    expect(mapArrivalResponse(raw)[0].trainId).toBe('UP-등촌-0');
  });

  describe('잘못된 입력에 대한 방어', () => {
    it('null이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse(null)).toEqual([]);
    });

    it('undefined이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse(undefined)).toEqual([]);
    });

    it('객체가 아닌 값(문자열)이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse('not an object')).toEqual([]);
    });

    it('객체가 아닌 값(숫자)이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse(42)).toEqual([]);
    });

    it('객체가 아닌 값(배열)이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse([1, 2, 3])).toEqual([]);
    });

    it('realtimeArrivalList가 배열이 아니면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse({ realtimeArrivalList: 'oops' })).toEqual([]);
    });

    it('realtimeArrivalList의 원소가 null이면 해당 원소만 건너뛴다', () => {
      const raw = {
        realtimeArrivalList: [
          null,
          {
            statnId: '1009000908',
            statnTid: '1009000907',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw)).toHaveLength(1);
    });

    it('realtimeArrivalList의 원소가 객체가 아니면 해당 원소만 건너뛴다', () => {
      const raw = {
        realtimeArrivalList: [
          'not an object',
          123,
          {
            statnId: '1009000908',
            statnTid: '1009000907',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw)).toHaveLength(1);
    });
  });
});

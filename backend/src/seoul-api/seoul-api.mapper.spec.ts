import { mapArrivalResponse } from './seoul-api.mapper';
import { SeoulArrivalResponse } from './seoul-api.types';
import jeungmi from '../../test/fixtures/station-arrival.success.json';
import gayang from '../../test/fixtures/station-arrival.express.json';
import empty from '../../test/fixtures/station-arrival.empty.json';
import seoul from '../../test/fixtures/station-arrival.multiline.json';

const LINE9 = '1009';

describe('mapArrivalResponse', () => {
  it('열차 4대를 모두 변환한다', () => {
    expect(mapArrivalResponse(jeungmi, LINE9)).toHaveLength(4);
  });

  it('열차번호를 trainId로 옮긴다', () => {
    const [first] = mapArrivalResponse(jeungmi, LINE9);
    expect(first.trainId).toBe('9129');
  });

  describe('방향 판단 (statnFid vs statnTid)', () => {
    it('statnTid가 statnFid보다 작으면 UP이다 (증미: 개화행)', () => {
      const trains = mapArrivalResponse(jeungmi, LINE9);
      expect(trains[0].directionId).toBe('UP');
      expect(trains[1].directionId).toBe('UP');
    });

    it('statnTid가 statnFid보다 크면 DOWN이다 (증미: 중앙보훈병원행)', () => {
      const trains = mapArrivalResponse(jeungmi, LINE9);
      expect(trains[2].directionId).toBe('DOWN');
      expect(trains[3].directionId).toBe('DOWN');
    });

    it('가양(statnFid 1009000908): 개화행/김포공항행은 statnTid 1009000906 → UP', () => {
      const trains = mapArrivalResponse(gayang, LINE9);
      expect(trains[0].directionId).toBe('UP');
      expect(trains[1].directionId).toBe('UP');
    });

    it('가양(statnFid 1009000906): 중앙보훈병원행은 statnTid 1009000908 → DOWN', () => {
      const trains = mapArrivalResponse(gayang, LINE9);
      expect(trains[2].directionId).toBe('DOWN');
      expect(trains[3].directionId).toBe('DOWN');
    });

    it('updnLine은 신뢰할 수 없으므로 사용하지 않는다: 상행이 실제로는 DOWN으로 매핑되는 예시', () => {
      // jeungmi rows 3,4 have updnLine "상행" but head toward 중앙보훈병원 (order 증가) → DOWN
      const raw = jeungmi as unknown as SeoulArrivalResponse;
      expect(raw.realtimeArrivalList?.[2].updnLine).toBe('상행');
      expect(mapArrivalResponse(jeungmi, LINE9)[2].directionId).toBe('DOWN');
    });

    it('statnFid와 statnTid가 같으면 방향을 알 수 없어 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            subwayId: '1009',
            statnId: '1009000908',
            statnFid: '1009000908',
            statnTid: '1009000908',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw, LINE9)).toEqual([]);
    });

    it('statnId와 statnTid가 같아도 (조회한 역에 정차 중) 방향은 정상적으로 판단한다', () => {
      // 서울역 실데이터: statnFid=1065006502, statnTid=statnId=1065006501
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            subwayId: '1065',
            statnId: '1065006501',
            statnFid: '1065006502',
            statnTid: '1065006501',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '서울',
            arvlCd: '1',
          },
        ],
      };
      const trains = mapArrivalResponse(raw, '1065');
      expect(trains).toHaveLength(1);
      expect(trains[0].directionId).toBe('UP');
    });

    it('statnFid 또는 statnTid가 없으면 방향을 알 수 없어 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            subwayId: '1009',
            statnFid: '1009000908',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw, LINE9)).toEqual([]);
    });

    it('statnFid 또는 statnTid가 숫자가 아니면 방향을 알 수 없어 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            subwayId: '1009',
            statnFid: 'abc',
            statnTid: '1009000908',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw, LINE9)).toEqual([]);
    });
  });

  describe('subwayId 필터 (환승역 다른 노선 제거)', () => {
    it('subwayId가 요청 노선과 다르면 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            subwayId: '1002',
            statnFid: '1009000908',
            statnTid: '1009000907',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw, LINE9)).toEqual([]);
    });

    it('subwayId가 없으면 노선을 알 수 없어 버린다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [
          {
            statnFid: '1009000908',
            statnTid: '1009000907',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw, LINE9)).toEqual([]);
    });

    describe('서울역 실데이터 (1001/1063/1065 혼재)', () => {
      it('요청한 노선(1001)의 열차만 남고 1063/1065 열차는 제거된다', () => {
        expect(mapArrivalResponse(seoul, '1001')).toHaveLength(2);
      });

      it('요청한 노선(1063)의 열차만 남고 1001/1065 열차는 제거된다', () => {
        expect(mapArrivalResponse(seoul, '1063')).toHaveLength(2);
      });

      it('요청한 노선(1065)의 열차만 남는다: statnTid == statnId(조회한 역) 행이 버려지지 않고 포함된다', () => {
        const trains = mapArrivalResponse(seoul, '1065');
        expect(trains).toHaveLength(1);
        expect(trains[0].directionId).toBe('UP');
      });

      it('9호선(1009)은 서울역 응답에 없으므로 빈 배열이다', () => {
        expect(mapArrivalResponse(seoul, LINE9)).toEqual([]);
      });

      it('arvlCd 1(도착) → ARRIVED', () => {
        const trains = mapArrivalResponse(seoul, '1001');
        expect(trains[0].status).toBe('ARRIVED');
      });

      it('arvlCd 2(출발) → DEPARTED', () => {
        const trains = mapArrivalResponse(seoul, '1065');
        expect(trains[0].status).toBe('DEPARTED');
      });

      it('barvlDt가 "0"이면 remainingSeconds는 null이다', () => {
        const trains = mapArrivalResponse(seoul, '1001');
        expect(trains).toHaveLength(2);
        for (const train of trains) {
          expect(train.remainingSeconds).toBeNull();
        }
      });
    });
  });

  it('급행을 EXPRESS, 일반을 LOCAL로 매핑한다', () => {
    const trains = mapArrivalResponse(gayang, LINE9);
    expect(trains[0].trainType).toBe('LOCAL');
    expect(trains[1].trainType).toBe('EXPRESS');
    expect(trains[3].trainType).toBe('EXPRESS');
  });

  it('arvlMsg3를 현재 위치 역명으로 옮긴다', () => {
    const trains = mapArrivalResponse(jeungmi, LINE9);
    expect(trains[0].currentStationName).toBe('신목동');
    expect(trains[1].currentStationName).toBe('노량진');
  });

  it('barvlDt를 초 단위 숫자로 변환한다', () => {
    expect(mapArrivalResponse(jeungmi, LINE9)[0].remainingSeconds).toBe(345);
  });

  it('barvlDt가 "0"이면 remainingSeconds는 null이다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        {
          subwayId: '1009',
          statnFid: '1009000909',
          statnTid: '1009000907',
          btrainSttus: '일반',
          btrainNo: '1',
          barvlDt: '0',
          arvlMsg3: '등촌',
          arvlCd: '2',
        },
      ],
    };
    expect(mapArrivalResponse(raw, LINE9)[0].remainingSeconds).toBeNull();
  });

  describe('arvlCd → status', () => {
    function itemWith(arvlCd: string) {
      return {
        subwayId: '1009',
        statnFid: '1009000909',
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
      expect(mapArrivalResponse(raw, LINE9)[0].status).toBe('APPROACHING');
    });

    it('1 도착 → ARRIVED', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('1')],
      };
      expect(mapArrivalResponse(raw, LINE9)[0].status).toBe('ARRIVED');
    });

    it('2 출발 → DEPARTED', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('2')],
      };
      expect(mapArrivalResponse(raw, LINE9)[0].status).toBe('DEPARTED');
    });

    it('3 전역출발 → DEPARTED (가양 실데이터)', () => {
      expect(mapArrivalResponse(gayang, LINE9)[2].status).toBe('DEPARTED');
    });

    it('4 전역진입 → APPROACHING', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('4')],
      };
      expect(mapArrivalResponse(raw, LINE9)[0].status).toBe('APPROACHING');
    });

    it('5 전역도착 → ARRIVED', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('5')],
      };
      expect(mapArrivalResponse(raw, LINE9)[0].status).toBe('ARRIVED');
    });

    it('99 운행중 → TRAVELING (증미 실데이터)', () => {
      expect(mapArrivalResponse(jeungmi, LINE9)[0].status).toBe('TRAVELING');
    });

    it('알 수 없는 arvlCd는 TRAVELING으로 처리한다', () => {
      const raw: SeoulArrivalResponse = {
        realtimeArrivalList: [itemWith('77')],
      };
      expect(mapArrivalResponse(raw, LINE9)[0].status).toBe('TRAVELING');
    });
  });

  it('빈 응답은 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse(empty, LINE9)).toEqual([]);
  });

  it('realtimeArrivalList가 아예 없어도 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse({}, LINE9)).toEqual([]);
  });

  it('현재 위치 역명이 없는 항목은 버린다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        {
          subwayId: '1009',
          statnFid: '1009000909',
          statnTid: '1009000907',
          btrainSttus: '일반',
          btrainNo: '1',
          barvlDt: '10',
          arvlCd: '1',
        },
      ],
    };
    expect(mapArrivalResponse(raw, LINE9)).toEqual([]);
  });

  it('열차번호가 없으면 방향과 위치로 안정적인 id를 만든다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        {
          subwayId: '1009',
          statnFid: '1009000909',
          statnTid: '1009000907',
          btrainSttus: '일반',
          barvlDt: '10',
          arvlMsg3: '등촌',
          arvlCd: '1',
        },
      ],
    };
    expect(mapArrivalResponse(raw, LINE9)[0].trainId).toBe('UP-등촌-0');
  });

  describe('잘못된 입력에 대한 방어', () => {
    it('null이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse(null, LINE9)).toEqual([]);
    });

    it('undefined이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse(undefined, LINE9)).toEqual([]);
    });

    it('객체가 아닌 값(문자열)이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse('not an object', LINE9)).toEqual([]);
    });

    it('객체가 아닌 값(숫자)이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse(42, LINE9)).toEqual([]);
    });

    it('객체가 아닌 값(배열)이면 빈 배열을 반환한다', () => {
      expect(mapArrivalResponse([1, 2, 3], LINE9)).toEqual([]);
    });

    it('realtimeArrivalList가 배열이 아니면 빈 배열을 반환한다', () => {
      expect(
        mapArrivalResponse({ realtimeArrivalList: 'oops' }, LINE9),
      ).toEqual([]);
    });

    it('realtimeArrivalList의 원소가 null이면 해당 원소만 건너뛴다', () => {
      const raw = {
        realtimeArrivalList: [
          null,
          {
            subwayId: '1009',
            statnFid: '1009000909',
            statnTid: '1009000907',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw, LINE9)).toHaveLength(1);
    });

    it('realtimeArrivalList의 원소가 객체가 아니면 해당 원소만 건너뛴다', () => {
      const raw = {
        realtimeArrivalList: [
          'not an object',
          123,
          {
            subwayId: '1009',
            statnFid: '1009000909',
            statnTid: '1009000907',
            btrainSttus: '일반',
            btrainNo: '1',
            barvlDt: '10',
            arvlMsg3: '등촌',
            arvlCd: '1',
          },
        ],
      };
      expect(mapArrivalResponse(raw, LINE9)).toHaveLength(1);
    });
  });
});

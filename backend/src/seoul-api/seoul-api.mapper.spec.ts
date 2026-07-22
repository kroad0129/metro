import { mapArrivalResponse } from './seoul-api.mapper';
import { SeoulArrivalResponse } from './seoul-api.types';
import success from '../../test/fixtures/station-arrival.success.json';
import empty from '../../test/fixtures/station-arrival.empty.json';

describe('mapArrivalResponse', () => {
  it('열차 4대를 모두 변환한다', () => {
    expect(mapArrivalResponse(success as SeoulArrivalResponse)).toHaveLength(4);
  });

  it('열차번호를 trainId로 옮긴다', () => {
    const [first] = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(first.trainId).toBe('9134');
  });

  it('상행을 UP, 하행을 DOWN으로 매핑한다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].directionId).toBe('UP');
    expect(trains[2].directionId).toBe('DOWN');
  });

  it('급행을 EXPRESS, 일반을 LOCAL로 매핑한다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].trainType).toBe('LOCAL');
    expect(trains[1].trainType).toBe('EXPRESS');
  });

  it('arvlMsg3를 현재 위치 역명으로 옮긴다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].currentStationName).toBe('등촌');
    expect(trains[1].currentStationName).toBe('염창');
  });

  it('barvlDt를 초 단위 숫자로 변환한다', () => {
    expect(mapArrivalResponse(success as SeoulArrivalResponse)[0].remainingSeconds).toBe(125);
  });

  it('barvlDt가 "0"이면 remainingSeconds는 null이다', () => {
    expect(mapArrivalResponse(success as SeoulArrivalResponse)[3].remainingSeconds).toBeNull();
  });

  it('arvlCd를 status로 매핑한다', () => {
    const trains = mapArrivalResponse(success as SeoulArrivalResponse);
    expect(trains[0].status).toBe('DEPARTED');    // 3 전역출발
    expect(trains[1].status).toBe('TRAVELING');   // 99 운행중
    expect(trains[2].status).toBe('APPROACHING'); // 4 전역진입
    expect(trains[3].status).toBe('DEPARTED');    // 2 출발
  });

  it('도착 코드를 ARRIVED로 매핑한다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '1' },
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '2', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '5' },
      ],
    };
    expect(mapArrivalResponse(raw).map((t) => t.status)).toEqual(['ARRIVED', 'ARRIVED']);
  });

  it('진입 코드를 APPROACHING으로 매핑한다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '0' },
      ],
    };
    expect(mapArrivalResponse(raw)[0].status).toBe('APPROACHING');
  });

  it('빈 응답은 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse(empty as SeoulArrivalResponse)).toEqual([]);
  });

  it('realtimeArrivalList가 아예 없어도 빈 배열을 반환한다', () => {
    expect(mapArrivalResponse({})).toEqual([]);
  });

  it('현재 위치 역명이 없는 항목은 버린다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlCd: '1' },
      ],
    };
    expect(mapArrivalResponse(raw)).toEqual([]);
  });

  it('방향을 알 수 없는 항목은 버린다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '???', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '1' },
      ],
    };
    expect(mapArrivalResponse(raw)).toEqual([]);
  });

  it('알 수 없는 arvlCd는 TRAVELING으로 처리한다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', btrainNo: '1', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '77' },
      ],
    };
    expect(mapArrivalResponse(raw)[0].status).toBe('TRAVELING');
  });

  it('열차번호가 없으면 위치와 방향으로 안정적인 id를 만든다', () => {
    const raw: SeoulArrivalResponse = {
      realtimeArrivalList: [
        { updnLine: '상행', btrainSttus: '일반', barvlDt: '10', arvlMsg3: '등촌', arvlCd: '1' },
      ],
    };
    expect(mapArrivalResponse(raw)[0].trainId).toBe('UP-등촌-0');
  });
});

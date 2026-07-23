import { mapTimetableRows, toServiceSeconds } from './seoul-api.timetable.mapper';
import up from '../../test/fixtures/real/timetable-jeungmi-up.raw.json';
import down from '../../test/fixtures/real/timetable-jeungmi-down.raw.json';

const 증미CD = '4108';

function rowsOf(fixture: unknown): unknown[] {
  const wrapper = (fixture as Record<string, { row: unknown[] }>)['SearchSTNTimeTableByIDService'];
  return wrapper.row;
}

describe('toServiceSeconds', () => {
  it('HH:MM:SS를 운행일 기준 초로 바꾼다 — 24시 이상 표기 포함', () => {
    expect(toServiceSeconds('05:40:20')).toBe(5 * 3600 + 40 * 60 + 20);
    expect(toServiceSeconds('24:48:25')).toBe(24 * 3600 + 48 * 60 + 25); // 자정 넘은 막차
  });

  it('출발 시각이 없거나(00:00:00) 해석 불가하면 null이다', () => {
    expect(toServiceSeconds('00:00:00')).toBeNull();
    expect(toServiceSeconds('')).toBeNull();
    expect(toServiceSeconds(undefined)).toBeNull();
    expect(toServiceSeconds('5시40분')).toBeNull();
  });
});

describe('mapTimetableRows (실제 증미 평일 시간표)', () => {
  it('상·하행 축을 합치면 전체 출발이 나온다', () => {
    const entries = mapTimetableRows([...rowsOf(up), ...rowsOf(down)], 증미CD);
    expect(entries.length).toBe(250); // 124 + 126
  });

  it('종착역 코드로 방향을 판정한다 — 개화 쪽(코드 작음)이 UP', () => {
    const entries = mapTimetableRows(rowsOf(up), 증미CD);
    expect(entries.every((e) => e.directionId === 'UP')).toBe(true);
    const downEntries = mapTimetableRows(rowsOf(down), 증미CD);
    expect(downEntries.every((e) => e.directionId === 'DOWN')).toBe(true);
  });

  it('출발 시각 순으로 정렬한다 — 첫차와 막차가 실제 값과 일치한다', () => {
    const entries = mapTimetableRows(rowsOf(down), 증미CD);
    expect(entries[0].departureServiceSeconds).toBe(toServiceSeconds('05:40:20'));
    expect(entries.at(-1)?.departureServiceSeconds).toBe(toServiceSeconds('24:48:25'));
  });

  it('당역 종착과 깨진 행은 버린다', () => {
    const rows = [
      { DESTSTATION: 증미CD, LEFTTIME: '10:00:00' }, // 당역 종착
      { DESTSTATION: '4101', LEFTTIME: '00:00:00', ARRIVETIME: '00:00:00' }, // 출발 없음
      'not-an-object',
      { DESTSTATION: '4101', LEFTTIME: '10:05:00' }, // 유효
    ];
    const entries = mapTimetableRows(rows, 증미CD);
    expect(entries).toEqual([{ departureServiceSeconds: 36300, directionId: 'UP' }]);
  });

  it('행 목록이 배열이 아니면 빈 배열이다', () => {
    expect(mapTimetableRows(null, 증미CD)).toEqual([]);
    expect(mapTimetableRows({}, 증미CD)).toEqual([]);
  });
});

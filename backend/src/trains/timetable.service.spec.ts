import { Station } from '../lines/types';
import { TimetableService } from './timetable.service';

const 증미: Station = { stationId: '1009000908', name: '증미', order: 8, isExpressStop: false };

/** KST 문자열을 epoch(ms)로. 테스트 가독성용. */
function kst(iso: string): number {
  return Date.parse(`${iso}+09:00`);
}

/**
 * 시간표 축약본: UP(개화 방면) 평일 05:40:50 첫차 ~ 24:55:20 막차, 낮 10:05 한 편.
 * 토요일(주 2)은 첫차만 06:00으로 다르게 두어 요일 구분을 검증한다.
 */
function fakeClient() {
  const weekday = [
    { DESTSTATION: '4101', LEFTTIME: '05:40:50' },
    { DESTSTATION: '4101', LEFTTIME: '10:05:00' },
    { DESTSTATION: '4101', LEFTTIME: '24:55:20' },
    { DESTSTATION: '4138', LEFTTIME: '05:40:20' },
    { DESTSTATION: '4138', LEFTTIME: '24:48:25' },
  ];
  const saturday = [
    { DESTSTATION: '4101', LEFTTIME: '06:00:00' },
    { DESTSTATION: '4138', LEFTTIME: '06:10:00' },
  ];
  const fetchStationTimetable = jest.fn(async (_cd: string, weekTag: string) =>
    weekTag === '2' ? saturday : weekday,
  );
  return { fetchStationTimetable };
}

function build() {
  const client = fakeClient();
  const service = new TimetableService(client as never);
  return { service, client };
}

describe('TimetableService.nextDeparture', () => {
  // 2026-07-22는 수요일, 07-24는 금요일, 07-25는 토요일이다.

  it('낮 시간 — 지금 이후의 첫 출발을 준다', async () => {
    const { service } = build();
    const next = await service.nextDeparture(증미, 'UP', kst('2026-07-22T10:00:00'));
    expect(next).toEqual({ departureAt: '2026-07-22T10:05:00+09:00', firstOfDay: false });
  });

  it('방향별로 따로 찾는다', async () => {
    const { service } = build();
    const next = await service.nextDeparture(증미, 'DOWN', kst('2026-07-22T10:00:00'));
    expect(next).toEqual({ departureAt: '2026-07-23T00:48:25+09:00', firstOfDay: false });
  });

  it('자정 직후 — 전날 운행일의 24시+ 막차를 준다', async () => {
    const { service } = build();
    // 목요일 00:30 = 수요일 운행일 24:30 → 수요일 막차 24:55(= 목요일 00:55)
    const next = await service.nextDeparture(증미, 'UP', kst('2026-07-23T00:30:00'));
    expect(next).toEqual({ departureAt: '2026-07-23T00:55:20+09:00', firstOfDay: false });
  });

  it('막차가 끝났으면 다음 운행일의 첫차를 준다', async () => {
    const { service } = build();
    // 목요일 01:30 = 수요일 운행일 25:30 — 수요일 막차(24:55)도 지났다 → 목요일 첫차
    const next = await service.nextDeparture(증미, 'UP', kst('2026-07-23T01:30:00'));
    expect(next).toEqual({ departureAt: '2026-07-23T05:40:50+09:00', firstOfDay: true });
  });

  it('금요일 심야에서 넘어가는 첫차는 토요일 시간표다', async () => {
    const { service, client } = build();
    // 토요일 01:30 = 금요일 운행일 25:30 → 토요일(주 2) 첫차 06:00
    const next = await service.nextDeparture(증미, 'UP', kst('2026-07-25T01:30:00'));
    expect(next).toEqual({ departureAt: '2026-07-25T06:00:00+09:00', firstOfDay: true });
    expect(client.fetchStationTimetable).toHaveBeenCalledWith('4108', '2', expect.any(String));
  });

  it('시간표는 역·요일별로 캐시된다 — 같은 요일 재조회에 호출이 늘지 않는다', async () => {
    const { service, client } = build();
    await service.nextDeparture(증미, 'UP', kst('2026-07-22T10:00:00'));
    const calls = client.fetchStationTimetable.mock.calls.length;
    await service.nextDeparture(증미, 'DOWN', kst('2026-07-22T11:00:00'));
    expect(client.fetchStationTimetable.mock.calls.length).toBe(calls);
  });

  it('9호선 역 코드는 4100 + 순번이다', async () => {
    const { service, client } = build();
    await service.nextDeparture(증미, 'UP', kst('2026-07-22T10:00:00'));
    expect(client.fetchStationTimetable).toHaveBeenCalledWith('4108', '1', '1');
    expect(client.fetchStationTimetable).toHaveBeenCalledWith('4108', '1', '2');
  });

  it('시간표가 비어 있으면 null이다', async () => {
    const client = { fetchStationTimetable: jest.fn(async () => []) };
    const service = new TimetableService(client as never);
    const next = await service.nextDeparture(증미, 'UP', kst('2026-07-22T10:00:00'));
    expect(next).toBeNull();
  });
});

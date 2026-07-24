import { CacheService } from '../common/cache.service';
import { LinesService } from '../lines/lines.service';
import { UpstreamUnavailableError } from '../seoul-api/seoul-api.errors';
import { RawTrain } from './types';
import { LineNotFoundError, StationNotFoundError } from './trains.errors';
import { TrainsService } from './trains.service';

const 증미 = '1009000908';

function rawTrain(over: Partial<RawTrain> = {}): RawTrain {
  return {
    trainId: 'T1',
    trainType: 'LOCAL',
    currentStationName: '등촌',
    remainingSeconds: 120,
    status: 'TRAVELING',
    directionId: 'UP',
    stationsAway: 1,
    recptnAt: '2026-07-23T13:57:02+09:00',
    ...over,
  };
}

function build(
  fetchImpl: () => Promise<RawTrain[]>,
  nextDeparture: jest.Mock = jest.fn(async () => null),
) {
  const lines = new LinesService();
  const cache = new CacheService(10_000, 300_000);
  const client = { fetchStationArrivals: jest.fn(fetchImpl) };
  const timetable = { nextDeparture };
  const service = new TrainsService(lines, cache, client as never, timetable as never);
  return { service, client, cache, timetable };
}

describe('TrainsService', () => {
  it('없는 노선은 LineNotFoundError를 던진다', async () => {
    const { service } = build(async () => []);
    await expect(service.getTrains('2', 증미)).rejects.toBeInstanceOf(LineNotFoundError);
  });

  it('없는 역은 StationNotFoundError를 던진다', async () => {
    const { service } = build(async () => []);
    await expect(service.getTrains('9', '1009000999')).rejects.toBeInstanceOf(StationNotFoundError);
  });

  it('선택한 역 정보를 응답에 담는다', async () => {
    const { service } = build(async () => []);
    const result = await service.getTrains('9', 증미);
    expect(result.station.name).toBe('증미');
    expect(result.line.name).toBe('서울 지하철 9호선');
  });

  it('열차가 없어도 방향 블록 두 개를 항상 반환한다', async () => {
    const { service } = build(async () => []);
    const result = await service.getTrains('9', 증미);
    expect(result.directions.map((d) => d.directionId)).toEqual(['UP', 'DOWN']);
    expect(result.directions[0].directionName).toBe('개화 방면');
    expect(result.directions[1].directionName).toBe('중앙보훈병원 방면');
    expect(result.directions[0].trains).toEqual([]);
  });

  it('열차를 방향별로 나눈다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'U1', directionId: 'UP' }),
      rawTrain({ trainId: 'D1', directionId: 'DOWN', currentStationName: '가양' }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['U1']);
    expect(result.directions[1].trains.map((t) => t.trainId)).toEqual(['D1']);
  });

  it('역명을 실제 역으로 매칭해 order를 채운다', async () => {
    const { service } = build(async () => [rawTrain({ currentStationName: '등촌' })]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains[0].currentStation).toEqual({
      stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false,
    });
  });

  it('매칭되지 않는 역명의 열차는 버린다', async () => {
    const { service } = build(async () => [rawTrain({ currentStationName: '강남' })]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains).toEqual([]);
  });

  it('급행 미정차역이어도 급행 열차를 그대로 유지한다 (상류 API가 이미 걸러줌)', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'EX', trainType: 'EXPRESS' }),
      rawTrain({ trainId: 'LO', trainType: 'LOCAL' }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['EX', 'LO']);
    expect(result.directions[0].trains.find((t) => t.trainId === 'EX')?.trainType).toBe('EXPRESS');
  });

  it('급행 정차역에서는 급행 열차를 유지한다', async () => {
    const 염창 = '1009000910';
    const { service } = build(async () => [
      rawTrain({ trainId: 'EX', trainType: 'EXPRESS', currentStationName: '신목동' }),
    ]);
    const result = await service.getTrains('9', 염창);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['EX']);
  });

  it('trainType은 EXPRESS와 LOCAL 모두 변형 없이 그대로 전달된다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'EX', trainType: 'EXPRESS' }),
      rawTrain({ trainId: 'LO', trainType: 'LOCAL' }),
    ]);
    const result = await service.getTrains('9', 증미);
    const byId = Object.fromEntries(result.directions[0].trains.map((t) => [t.trainId, t.trainType]));
    expect(byId['EX']).toBe('EXPRESS');
    expect(byId['LO']).toBe('LOCAL');
  });

  it('도착이 빠른 열차부터 정렬한다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'LATE', remainingSeconds: 300 }),
      rawTrain({ trainId: 'SOON', remainingSeconds: 60 }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['SOON', 'LATE']);
  });

  it('도착 시간을 모르는 열차는 뒤로 보낸다', async () => {
    const { service } = build(async () => [
      rawTrain({ trainId: 'UNKNOWN', remainingSeconds: null }),
      rawTrain({ trainId: 'KNOWN', remainingSeconds: 300 }),
    ]);
    const result = await service.getTrains('9', 증미);
    expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['KNOWN', 'UNKNOWN']);
  });

  it('TTL 이내 재요청은 외부 API를 다시 호출하지 않는다', async () => {
    const { service, client } = build(async () => [rawTrain()]);
    await service.getTrains('9', 증미);
    await service.getTrains('9', 증미);
    expect(client.fetchStationArrivals).toHaveBeenCalledTimes(1);
  });

  it('정상 응답은 stale이 false다', async () => {
    const { service } = build(async () => [rawTrain()]);
    expect((await service.getTrains('9', 증미)).stale).toBe(false);
  });

  it('외부 실패 시 마지막 성공 데이터를 stale로 반환한다', async () => {
    jest.useFakeTimers();
    try {
      let shouldFail = false;
      const { service } = build(async () => {
        if (shouldFail) throw new UpstreamUnavailableError();
        return [rawTrain({ trainId: 'CACHED' })];
      });

      const first = await service.getTrains('9', 증미);
      expect(first.stale).toBe(false);

      shouldFail = true;
      jest.advanceTimersByTime(10_001);

      const second = await service.getTrains('9', 증미);
      expect(second.stale).toBe(true);
      expect(second.directions[0].trains[0].trainId).toBe('CACHED');
      expect(second.updatedAt).toBe(first.updatedAt);
    } finally {
      jest.useRealTimers();
    }
  });

  it('외부 실패 시 캐시를 빈 배열로 덮어쓰지 않는다 (stale 경로 파괴 회귀 방지)', async () => {
    jest.useFakeTimers();
    try {
      let shouldFail = false;
      const { service, cache } = build(async () => {
        if (shouldFail) throw new UpstreamUnavailableError();
        return [rawTrain({ trainId: 'CACHED' })];
      });

      await service.getTrains('9', 증미);
      const key = `trains:9:${증미}`;
      expect(cache.get<RawTrain[]>(key)).toEqual([rawTrain({ trainId: 'CACHED' })]);

      shouldFail = true;
      jest.advanceTimersByTime(10_001); // TTL 경과, 하지만 stale 윈도우 이내

      const result = await service.getTrains('9', 증미);
      expect(result.stale).toBe(true);
      expect(result.directions[0].trains.map((t) => t.trainId)).toEqual(['CACHED']);

      // 실패 응답이 캐시를 빈 배열로 덮어쓰지 않았어야 한다.
      const stillStale = cache.getStale<RawTrain[]>(key);
      expect(stillStale?.value).toEqual([rawTrain({ trainId: 'CACHED' })]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stale 데이터도 없으면 외부 오류를 그대로 던진다', async () => {
    const { service } = build(async () => {
      throw new UpstreamUnavailableError();
    });
    await expect(service.getTrains('9', 증미)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('외부 클라이언트에 역 이름과 노선의 externalLineId를 함께 전달한다', async () => {
    const { service, client } = build(async () => []);
    await service.getTrains('9', 증미);
    expect(client.fetchStationArrivals).toHaveBeenCalledWith('증미', '1009');
  });

  describe('시간표 기준 다음 출발(nextSchedule)', () => {
    it('열차가 없는 방향에는 시간표의 다음 출발을 채운다', async () => {
      const nextDeparture = jest.fn(async () => ({
        departureAt: '2026-07-24T05:40:50+09:00',
        firstOfDay: true,
      }));
      const { service } = build(async () => [], nextDeparture);
      const result = await service.getTrains('9', 증미);
      expect(result.directions[0].nextSchedule).toEqual({
        departureAt: '2026-07-24T05:40:50+09:00',
        firstOfDay: true,
      });
      expect(nextDeparture).toHaveBeenCalledTimes(2); // 양방향 모두 비었으므로
    });

    it('열차가 있는 방향에는 시간표를 조회하지 않는다', async () => {
      const nextDeparture = jest.fn(async () => null);
      const { service } = build(async () => [rawTrain({ directionId: 'UP' })], nextDeparture);
      const result = await service.getTrains('9', 증미);
      expect(result.directions[0].nextSchedule).toBeUndefined(); // UP에는 열차가 있다
      expect(nextDeparture).toHaveBeenCalledTimes(1); // DOWN만
    });

    it('시간표 조회가 실패해도 본 응답은 성공한다 (nextSchedule=null)', async () => {
      const nextDeparture = jest.fn(async () => {
        throw new Error('timetable down');
      });
      const { service } = build(async () => [], nextDeparture);
      const result = await service.getTrains('9', 증미);
      expect(result.directions[0].nextSchedule).toBeNull();
      expect(result.directions[1].nextSchedule).toBeNull();
    });
  });
});

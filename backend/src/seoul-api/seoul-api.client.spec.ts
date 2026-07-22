import { SeoulApiClient } from './seoul-api.client';
import {
  UpstreamRateLimitedError,
  UpstreamUnavailableError,
} from './seoul-api.errors';
import success from '../../test/fixtures/station-arrival.success.json';

const LINE9 = '1009';

const CONFIG = {
  port: 3000,
  seoulApiKey: 'TESTKEY',
  seoulBaseUrl: 'http://example.test/api/subway',
  cacheTtlMs: 10_000,
  staleMaxAgeMs: 300_000,
};

describe('SeoulApiClient', () => {
  it('역명으로 URL을 만들어 호출하고 변환 결과를 반환한다', async () => {
    const http = jest.fn().mockResolvedValue(success);
    const client = new SeoulApiClient(CONFIG, http);

    const trains = await client.fetchStationArrivals('증미', LINE9);

    expect(http).toHaveBeenCalledWith(
      'http://example.test/api/subway/TESTKEY/json/realtimeStationArrival/0/20/%EC%A6%9D%EB%AF%B8',
    );
    expect(trains).toHaveLength(4);
  });

  it('호출할 때마다 호출 횟수를 센다', async () => {
    const client = new SeoulApiClient(
      CONFIG,
      jest.fn().mockResolvedValue(success),
    );
    expect(client.getCallCount()).toBe(0);
    await client.fetchStationArrivals('증미', LINE9);
    await client.fetchStationArrivals('가양', LINE9);
    expect(client.getCallCount()).toBe(2);
  });

  it('호출 제한 코드(평평한 구조)는 UpstreamRateLimitedError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue({
      status: 500,
      code: 'ERROR-337',
      message: '일일 트래픽 요청 제한을 초과하였습니다.',
    });
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).rejects.toBeInstanceOf(UpstreamRateLimitedError);
  });

  it('네트워크 오류는 UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('데이터 없음 코드는 오류가 아니라 빈 배열이다 (실제 API는 이 코드를 평평한 구조로 내려준다)', async () => {
    const http = jest.fn().mockResolvedValue({
      status: 500,
      code: 'INFO-200',
      message: '해당하는 데이터가 없습니다.',
      total: 0,
    });
    const client = new SeoulApiClient(CONFIG, http);
    await expect(client.fetchStationArrivals('증미', LINE9)).resolves.toEqual(
      [],
    );
  });

  it('알 수 없는 오류 코드(평평한 구조)는 UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue({
      status: 500,
      code: 'ERROR-500',
      message: '서버 오류',
    });
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('인증키 오류 코드(평평한 구조 INFO-100)도 UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue({
      status: 500,
      code: 'INFO-100',
      message: '인증키가 유효하지 않습니다. 인증키를 확인하십시오.',
    });
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('본문이 객체가 아니면(문자열) UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue('not json' as never);
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('본문이 배열이면 UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue([1, 2, 3] as never);
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('코드도 realtimeArrivalList도 없는 본문은 UpstreamUnavailableError로 변환한다', async () => {
    const http = jest.fn().mockResolvedValue({ foo: 'bar' } as never);
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('코드는 없지만 realtimeArrivalList가 있으면 정상 처리한다(신뢰할 수 있는 성공 신호)', async () => {
    const http = jest.fn().mockResolvedValue({
      realtimeArrivalList: [
        {
          subwayId: '1009',
          statnFid: '1009000908',
          statnTid: '1009000907',
          btrainSttus: '일반',
          btrainNo: '1',
          barvlDt: '10',
          arvlMsg3: '등촌',
          arvlCd: '1',
        },
      ],
    } as never);
    const client = new SeoulApiClient(CONFIG, http);
    await expect(
      client.fetchStationArrivals('증미', LINE9),
    ).resolves.toHaveLength(1);
  });

  it('환승역 응답에서 요청한 노선(expectedLineId)의 열차만 반환한다', async () => {
    const http = jest.fn().mockResolvedValue({
      errorMessage: {
        status: 200,
        code: 'INFO-000',
        message: '정상 처리되었습니다.',
        total: 2,
      },
      realtimeArrivalList: [
        {
          subwayId: '1002',
          statnFid: '1002000908',
          statnTid: '1002000907',
          btrainSttus: '일반',
          btrainNo: '1',
          barvlDt: '10',
          arvlMsg3: '당산',
          arvlCd: '1',
        },
        {
          subwayId: '1009',
          statnFid: '1009000908',
          statnTid: '1009000907',
          btrainSttus: '일반',
          btrainNo: '2',
          barvlDt: '10',
          arvlMsg3: '당산',
          arvlCd: '1',
        },
      ],
    });
    const client = new SeoulApiClient(CONFIG, http);
    const trains = await client.fetchStationArrivals('당산', LINE9);
    expect(trains).toHaveLength(1);
    expect(trains[0].trainId).toBe('2');
  });
});

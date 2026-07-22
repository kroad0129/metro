import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { getStations, getTrains } from './subway';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('getStations', () => {
  it('역 목록 엔드포인트를 호출한다', async () => {
    const fetchMock = mockFetch(200, { lineId: '9', lineName: '서울 지하철 9호선', stations: [] });
    const result = await getStations();
    expect(fetchMock).toHaveBeenCalledWith('/api/lines/9/stations');
    expect(result.lineId).toBe('9');
  });
});

describe('getTrains', () => {
  it('역 ID로 열차 엔드포인트를 호출한다', async () => {
    const fetchMock = mockFetch(200, { directions: [] });
    await getTrains('1009000908');
    expect(fetchMock).toHaveBeenCalledWith('/api/lines/9/stations/1009000908/trains');
  });

  it('역 ID를 URL 인코딩한다', async () => {
    const fetchMock = mockFetch(200, { directions: [] });
    await getTrains('9 8');
    expect(fetchMock).toHaveBeenCalledWith('/api/lines/9/stations/9%208/trains');
  });

  it('오류 응답을 ApiError로 변환한다', async () => {
    mockFetch(404, { error: { code: 'STATION_NOT_FOUND', message: '지원하지 않는 역입니다' } });
    await expect(getTrains('1009000999')).rejects.toBeInstanceOf(ApiError);
    await expect(getTrains('1009000999')).rejects.toMatchObject({ code: 'STATION_NOT_FOUND' });
  });

  it('오류 본문을 읽을 수 없으면 UNKNOWN 코드를 쓴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await expect(getTrains('1009000908')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('네트워크 실패는 NETWORK_ERROR로 변환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getTrains('1009000908')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

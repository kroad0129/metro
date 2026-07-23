import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ApiError } from './api/client';
import * as api from './api/subway';
import { STORAGE_KEY } from './hooks/useSelectedStation';
import type { Station, StationsResponse, TrainsResponse } from './types/subway';

const stations: Station[] = [
  { stationId: '1009000907', name: '가양', order: 7, isExpressStop: true },
  { stationId: '1009000908', name: '증미', order: 8, isExpressStop: false },
  { stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false },
];

const stationsResponse: StationsResponse = {
  lineId: '9',
  lineName: '서울 지하철 9호선',
  stations,
};

function trainsResponse(over: Partial<TrainsResponse> = {}): TrainsResponse {
  return {
    line: { id: '9', name: '서울 지하철 9호선' },
    station: stations[1],
    directions: [
      {
        directionId: 'UP',
        directionName: '개화 방면',
        trains: [
          {
            trainId: '9134',
            trainType: 'LOCAL',
            currentStation: stations[2],
            remainingSeconds: 120,
            status: 'TRAVELING',
            positionRatio: 0.5,
            stationsAway: 1,
            recptnAt: new Date().toISOString(),
          },
        ],
      },
      { directionId: 'DOWN', directionName: '중앙보훈병원 방면', trains: [] },
    ],
    updatedAt: new Date().toISOString(),
    stale: false,
    ...over,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('역 목록을 불러오는 동안 로딩을 표시한다', () => {
    vi.spyOn(api, 'getStations').mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('저장된 역이 없으면 역을 고르라고 안내한다', async () => {
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    const trainsSpy = vi.spyOn(api, 'getTrains');
    render(<App />);
    await waitFor(() => expect(screen.getByText('역을 선택하세요')).toBeInTheDocument());
    expect(trainsSpy).not.toHaveBeenCalled();
  });

  it('역을 선택하면 양방향 열차 정보를 보여준다', async () => {
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('역')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('역'), '1009000908');

    await waitFor(() => expect(screen.getByText('개화 방면')).toBeInTheDocument());
    expect(screen.getByText('중앙보훈병원 방면')).toBeInTheDocument();
    // barvlDt 120초를 그대로 카운트다운 시작점으로 → "2분"
    expect(screen.getByTestId('train-marker')).toHaveTextContent('2분');
  });

  it('선택한 역을 localStorage에 저장한다', async () => {
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('역')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('역'), '1009000908');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('1009000908');
  });

  it('저장된 역이 있으면 바로 조회한다', async () => {
    localStorage.setItem(STORAGE_KEY, '1009000908');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    const trainsSpy = vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);
    await waitFor(() => expect(trainsSpy).toHaveBeenCalledWith('1009000908'));
    expect(await screen.findByText('개화 방면')).toBeInTheDocument();
  });

  it('stale 응답이면 배너를 보여준다', async () => {
    localStorage.setItem(STORAGE_KEY, '1009000908');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse({ stale: true }));
    render(<App />);
    expect(await screen.findByText(/갱신 실패/)).toBeInTheDocument();
  });

  it('열차 조회가 실패하면 오류와 재시도 버튼을 보여준다', async () => {
    localStorage.setItem(STORAGE_KEY, '1009000908');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockRejectedValue(
      new ApiError('UPSTREAM_UNAVAILABLE', '실시간 지하철 정보를 가져오지 못했습니다.'),
    );
    render(<App />);
    expect(await screen.findByText('실시간 지하철 정보를 가져오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('역 목록 조회가 실패하면 오류를 보여준다', async () => {
    vi.spyOn(api, 'getStations').mockRejectedValue(new ApiError('NETWORK_ERROR', '서버에 연결하지 못했습니다.'));
    render(<App />);
    expect(await screen.findByText('서버에 연결하지 못했습니다.')).toBeInTheDocument();
  });

  it('새로고침 버튼은 쿨다운 동안 비활성화된다', async () => {
    localStorage.setItem(STORAGE_KEY, '1009000908');
    vi.spyOn(api, 'getStations').mockResolvedValue(stationsResponse);
    vi.spyOn(api, 'getTrains').mockResolvedValue(trainsResponse());
    render(<App />);
    const button = await screen.findByRole('button', { name: '새로고침' });
    await waitFor(() => expect(button).toBeDisabled());
  });
});

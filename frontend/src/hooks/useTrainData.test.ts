import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/subway';
import { ApiError } from '../api/client';
import type { TrainsResponse } from '../types/subway';
import { useTrainData } from './useTrainData';

const response = {
  line: { id: '9', name: '서울 지하철 9호선' },
  station: { stationId: '1009000908', name: '증미', order: 8, isExpressStop: false },
  directions: [],
  updatedAt: '2026-07-22T14:00:00+09:00',
  stale: false,
} as TrainsResponse;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('useTrainData', () => {
  it('역 ID가 null이면 조회하지 않는다', () => {
    const spy = vi.spyOn(api, 'getTrains');
    renderHook(() => useTrainData(null));
    expect(spy).not.toHaveBeenCalled();
  });

  it('역 ID가 주어지면 즉시 한 번 조회한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('1009000908'));
    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('자동으로 재조회하지 않는다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('1009000908'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('위상이 그대로면 앵커(anchorSinceMs)를 유지하고, 바뀌면 새로 잡는다', async () => {
    const trainIn = (status: 'TRAVELING' | 'ARRIVED') => ({
      ...response,
      directions: [
        {
          directionId: 'UP' as const,
          directionName: '개화 방면',
          trains: [
            {
              trainId: '9075',
              trainType: 'LOCAL' as const,
              currentStation: { stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false },
              remainingSeconds: 95,
              status,
              positionRatio: 0.5,
            },
          ],
        },
      ],
    });
    const spy = vi
      .spyOn(api, 'getTrains')
      .mockResolvedValueOnce(trainIn('TRAVELING'))
      .mockResolvedValueOnce(trainIn('TRAVELING'))
      .mockResolvedValue(trainIn('ARRIVED'));

    const { result } = renderHook(() => useTrainData('1009000908', 15000));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const first = result.current.data?.directions[0].trains[0].anchorSinceMs;
    expect(first).toBeDefined();

    // 같은 위상으로 재조회 → 앵커 유지 (가상 열차가 이어서 전진한다)
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(result.current.data?.directions[0].trains[0].anchorSinceMs).toBe(first);

    // 위상 변경(도착) → 앵커 갱신
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    const third = result.current.data?.directions[0].trains[0].anchorSinceMs;
    expect(third).toBeDefined();
    expect(third).not.toBe(first);
  });

  it('pollMs를 주면 그 간격으로 자동 폴링한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    renderHook(() => useTrainData('1009000908', 15000));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1)); // 마운트 즉시 1회
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
  });

  it('탭이 가려지면 폴링을 멈추고, 다시 보이면 즉시 조회한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    renderHook(() => useTrainData('1009000908', 15000));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    await act(async () => setVisibility('hidden'));
    await act(async () => {
      vi.advanceTimersByTime(45000);
    });
    expect(spy).toHaveBeenCalledTimes(1); // 가려진 동안엔 늘지 않는다

    await act(async () => setVisibility('visible'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2)); // 다시 보이면 즉시 1회
  });

  it('refresh를 부르면 다시 조회한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('1009000908'));
    await waitFor(() => expect(result.current.canRefresh).toBe(false));
    await act(async () => {
      vi.advanceTimersByTime(3001);
    });
    await waitFor(() => expect(result.current.canRefresh).toBe(true));
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('쿨다운 중에는 refresh가 무시된다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('1009000908'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      result.current.refresh();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.canRefresh).toBe(false);
  });

  it('역이 바뀌면 다시 조회한다', async () => {
    const spy = vi.spyOn(api, 'getTrains').mockResolvedValue(response);
    const { rerender } = renderHook(({ id }) => useTrainData(id), {
      initialProps: { id: '1009000908' as string | null },
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender({ id: '1009000909' });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith('1009000909');
  });

  it('오류가 나면 error에 담는다', async () => {
    vi.spyOn(api, 'getTrains').mockRejectedValue(new ApiError('UPSTREAM_UNAVAILABLE', '실패'));
    const { result } = renderHook(() => useTrainData('1009000908'));
    await waitFor(() => expect(result.current.error?.code).toBe('UPSTREAM_UNAVAILABLE'));
    expect(result.current.data).toBeNull();
  });

  it('오류 후 성공하면 error를 지운다', async () => {
    const spy = vi
      .spyOn(api, 'getTrains')
      .mockRejectedValueOnce(new ApiError('UPSTREAM_UNAVAILABLE', '실패'))
      .mockResolvedValue(response);
    const { result } = renderHook(() => useTrainData('1009000908'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => {
      vi.advanceTimersByTime(3001);
    });
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

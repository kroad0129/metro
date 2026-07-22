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

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

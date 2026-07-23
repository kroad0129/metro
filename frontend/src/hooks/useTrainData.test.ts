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

  it('응답의 recptnAt을 그대로 전달한다 — 카운트다운 기준 시각', async () => {
    const withRecptn = {
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
              status: 'TRAVELING' as const,
              positionRatio: 0.5,
              stationsAway: 1,
              recptnAt: '2026-07-23T13:57:02+09:00',
            },
          ],
        },
      ],
    };
    vi.spyOn(api, 'getTrains').mockResolvedValue(withRecptn);

    const { result } = renderHook(() => useTrainData('1009000908'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const train = result.current.data?.directions[0].trains[0];
    expect(train?.recptnAt).toBe('2026-07-23T13:57:02+09:00');
    expect(train?.stationsAway).toBe(1);
  });

  it('거리가 그대로면 구간 기준 시각을 유지하고, 거리가 줄면 새로 잡는다', async () => {
    // barvlDt는 구간 내내 얼어 있으므로, 기준을 매 폴링마다 다시 잡으면 카운트다운이 리셋된다.
    // 실제 API처럼 거리별 barvlDt가 다르다(d=2→225, d=1→95). 같게 두면 연속성 클램프가
    // 백데이트한 기준이 우연히 이전 기준과 일치해 이 테스트가 아무것도 검증하지 못한다.
    const at = (stationsAway: number, recptnAt: string, remainingSeconds = 225) => ({
      ...response,
      directions: [
        {
          directionId: 'UP' as const,
          directionName: '개화 방면',
          trains: [
            {
              trainId: '9125',
              trainType: 'LOCAL' as const,
              currentStation: { stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false },
              remainingSeconds,
              status: 'TRAVELING' as const,
              positionRatio: 0.5,
              stationsAway,
              recptnAt,
            },
          ],
        },
      ],
    });
    const spy = vi
      .spyOn(api, 'getTrains')
      .mockResolvedValueOnce(at(2, '2026-07-23T13:57:02+09:00'))
      .mockResolvedValueOnce(at(2, '2026-07-23T13:57:30+09:00')) // recptnAt만 갱신
      .mockResolvedValue(at(1, '2026-07-23T13:58:00+09:00', 95)); // 한 정거장 전진

    const { result } = renderHook(() => useTrainData('1009000908', 15000));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const first = result.current.data?.directions[0].trains[0].segmentStartedAtMs;

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    // recptnAt이 앞으로 갔어도 같은 구간이면 기준은 그대로여야 한다
    expect(result.current.data?.directions[0].trains[0].segmentStartedAtMs).toBe(first);

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    // 세 번째 응답(d=1)이 화면에 반영될 때까지 기다린 뒤 확인한다 — 호출 횟수만 기다리면
    // 응답 처리(마이크로태스크)가 아직 안 끝났을 수 있다.
    await waitFor(() => expect(result.current.data?.directions[0].trains[0].stationsAway).toBe(1));
    // 거리가 줄면 새 구간 — 기준을 다시 잡는다
    expect(result.current.data?.directions[0].trains[0].segmentStartedAtMs).not.toBe(first);
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

  it('성공한 뒤 폴링이 실패해도 화면 데이터는 지우지 않는다', async () => {
    vi.spyOn(api, 'getTrains')
      .mockResolvedValueOnce(response)
      .mockRejectedValue(new ApiError('UPSTREAM_UNAVAILABLE', '실패'));
    const { result } = renderHook(() => useTrainData('1009000908', 15000));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).not.toBeNull(); // 마지막 데이터 유지 — 화면이 통째로 사라지지 않는다
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

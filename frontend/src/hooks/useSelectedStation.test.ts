import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Station } from '../types/subway';
import { STORAGE_KEY, useSelectedStation } from './useSelectedStation';

const stations: Station[] = [
  { stationId: '1009000908', name: '증미', order: 8, isExpressStop: false },
  { stationId: '1009000909', name: '등촌', order: 9, isExpressStop: false },
];

beforeEach(() => localStorage.clear());

describe('useSelectedStation', () => {
  it('저장된 역이 없으면 선택 없음으로 시작한다', () => {
    const { result } = renderHook(() => useSelectedStation(stations));
    expect(result.current.selected).toBeNull();
  });

  it('역을 선택하면 상태와 localStorage에 반영된다', () => {
    const { result } = renderHook(() => useSelectedStation(stations));
    act(() => result.current.select('1009000909'));
    expect(result.current.selected?.name).toBe('등촌');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1009000909');
  });

  it('저장된 역이 있으면 그 역으로 시작한다', () => {
    localStorage.setItem(STORAGE_KEY, '1009000908');
    const { result } = renderHook(() => useSelectedStation(stations));
    expect(result.current.selected?.name).toBe('증미');
  });

  it('저장된 역이 목록에 없으면 선택 없음으로 시작한다', () => {
    localStorage.setItem(STORAGE_KEY, '1009000999');
    const { result } = renderHook(() => useSelectedStation(stations));
    expect(result.current.selected).toBeNull();
  });

  it('역 목록이 아직 비어 있으면 선택하지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, '1009000908');
    const { result } = renderHook(() => useSelectedStation([]));
    expect(result.current.selected).toBeNull();
  });

  it('목록이 나중에 도착하면 저장된 역을 복원한다', () => {
    localStorage.setItem(STORAGE_KEY, '1009000908');
    const { result, rerender } = renderHook(({ list }) => useSelectedStation(list), {
      initialProps: { list: [] as Station[] },
    });
    expect(result.current.selected).toBeNull();
    rerender({ list: stations });
    expect(result.current.selected?.name).toBe('증미');
  });
});

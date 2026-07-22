import { useCallback, useEffect, useState } from 'react';
import type { Station } from '../types/subway';

export const STORAGE_KEY = 'subway-tracker:selected-station';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // 프라이빗 모드 등에서 접근이 막힐 수 있다.
  }
}

function writeStored(stationId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, stationId);
  } catch {
    // 저장 실패는 무시한다. 이번 세션 동안은 상태로 유지된다.
  }
}

export function useSelectedStation(stations: Station[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 역 목록은 비동기로 도착하므로, 목록이 채워진 뒤에 저장된 역을 복원한다.
  useEffect(() => {
    if (selectedId !== null || stations.length === 0) return;
    const stored = readStored();
    if (stored && stations.some((s) => s.stationId === stored)) {
      setSelectedId(stored);
    }
  }, [stations, selectedId]);

  const select = useCallback((stationId: string) => {
    setSelectedId(stationId);
    writeStored(stationId);
  }, []);

  const selected = stations.find((s) => s.stationId === selectedId) ?? null;

  return { selected, select };
}

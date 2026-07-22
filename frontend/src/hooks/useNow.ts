import { useEffect, useState } from 'react';

/**
 * 1초(기본값)마다 현재 시각을 다시 읽어 리렌더를 유발하는 화면 전용 타이머.
 * 데이터를 다시 조회하지 않는다 — remainingAt/formatRemaining이 이 값을 받아
 * 마지막 조회 시각(updatedAt) 기준으로 남은 시간을 화면에서만 째깍이게 한다.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

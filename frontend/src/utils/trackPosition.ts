import type { DirectionId, Station, Train } from '../types/subway';

/** 선택한 역 앞으로 몇 개 역까지 트랙에 그릴지. 역간 1.5~2분이므로 약 8분치 시야다. */
export const TRACK_SPAN = 4;

/**
 * 트랙에 그릴 역들을 왼쪽부터 오른쪽 순서로 만든다.
 * 마지막 원소는 항상 선택한 역이다 — 두 방향 패널의 오른쪽 끝을 통일해
 * 사용자가 매번 어느 쪽이 자기 역인지 다시 읽지 않게 한다(스펙 7.3절).
 */
export function buildTrack(
  stations: Station[],
  selected: Station,
  direction: DirectionId,
  span: number = TRACK_SPAN,
): Station[] {
  // UP(개화 방면)은 order가 감소하는 방향으로 달리므로 열차는 order가 큰 쪽에서 온다.
  const step = direction === 'UP' ? 1 : -1;
  const byOrder = new Map(stations.map((s) => [s.order, s]));

  const track: Station[] = [];
  for (let distance = span; distance >= 1; distance -= 1) {
    const station = byOrder.get(selected.order + step * distance);
    if (station) track.push(station);
  }
  track.push(selected);
  return track;
}

/**
 * 트랙 위에서 열차의 left 위치를 퍼센트로 계산한다.
 * 열차가 트랙 범위 밖에 있으면 null — 호출부에서 "다음 열차 N분" 텍스트로 처리한다.
 */
export function trainLeftPercent(track: Station[], train: Train): number | null {
  const index = track.findIndex((s) => s.stationId === train.currentStation.stationId);
  if (index === -1) return null;
  if (track.length <= 1) return 100;

  const position = index + train.positionRatio;
  const percent = (position / (track.length - 1)) * 100;
  return Math.min(100, Math.max(0, percent));
}

/** 남은 시간을 사람이 읽는 문자열로. 분은 올림한다 — 늦게 잡는 쪽이 안전하다. */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds <= 0) return '곧 도착';
  if (seconds < 60) return `${seconds}초`;
  return `${Math.ceil(seconds / 60)}분`;
}

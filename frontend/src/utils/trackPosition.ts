import type { DirectionId, Station, Train } from '../types/subway';

/** 선택한 역 앞으로 몇 개 역까지 트랙에 그릴지. 2 전역까지(약 4분치 시야). 서울시 API가
 *  정차 상태를 정확히 주는 범위(내 역 + 전역)에 가깝게, 가까운 열차만 또렷이 보여준다. */
export const TRACK_SPAN = 2;

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
 * 남은 시간을 사람이 읽는 문자열로. 가상 열차 모델이 매초 전진하므로 초까지 보여준다 —
 * 시간이 실제로 흐르고 있음이 눈에 보이게. 1분 미만은 초만.
 */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds <= 0) return '곧 도착';

  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}초`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes}분` : `${minutes}분 ${rest}초`;
}

/**
 * 열차 위에 띄울 짧은 안내 — 기호(점·맥동)만으로는 안 읽혀서 상태를 글자로 함께 말한다.
 * - 내 역: "도착" / "곧 도착" (시간 자리를 대신한다 — 행동 판단용 문구)
 * - 중간 역: "정차" / "진입" (그 역 위에 뜬다 — "도착"이라 쓰면 내 역 도착과 헷갈린다)
 * - 이동 중(운행·출발): null — 화살표 흐름이 말하고, 출발 직후 표시는 TrainFlow가 맡는다.
 */
export type Callout = '도착' | '곧 도착' | '정차' | '진입';

export function trainCallout(train: Train, isSelectedStation: boolean): Callout | null {
  if (train.status === 'ARRIVED') return isSelectedStation ? '도착' : '정차';
  if (train.status === 'APPROACHING') return isSelectedStation ? '곧 도착' : '진입';
  return null;
}

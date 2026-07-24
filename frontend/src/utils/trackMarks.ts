import type { Train, TrainType } from '../types/subway';
import { centerOf, type PlacedTrain } from './panelLayout';
import { formatRemaining } from './trackPosition';

/**
 * 트랙에 그릴 것들의 계산 — 어떤 열차를 한 마크로 묶을지, 무슨 글자를 붙일지.
 *
 * 화면 규칙(스펙 2026-07-23-discrete-placement.md):
 * - 열차는 모두 노선 라인 **한 줄** 위에 선다. 위아래로 쪼개지 않는다.
 * - 실제로 같은 자리에 겹칠 수 있는 조합은 급행이 일반을 따라잡을 때뿐이라
 *   (일반끼리는 앞뒤로 붙지 않는다), 겹칠 때는 마크 하나를 두 색으로 그린다.
 * - 시간은 열차마다 붙이지 않고 방면 이름 밑 고정 두 칸에 모은다 — 글자끼리 부딪히지 않고
 *   열차 수와 무관하게 화면 구조가 변하지 않는다.
 */

/** 열차 마크(점·화살표)가 차지하는 자리의 반폭(%) — 이보다 가까우면 한 마크로 묶는다. */
export const MARK_HALF = 4;

/** 1분 이하로 남으면 초를 세지 않고 "곧 도착"으로 말한다 — 그 구간의 초는 못 믿는다. */
export const SOON_SECONDS = 60;

/** 트랙 인덱스를 %로. flip이면 좌우 반전 — 반대 방향 패널은 오른쪽에서 왼쪽으로 달린다. */
export function namePercent(index: number, count: number, flip: boolean): number {
  const raw = count <= 1 ? 100 : (index / (count - 1)) * 100;
  return flip ? 100 - raw : raw;
}

/**
 * 급행이 서지 않는 역에 걸쳐 있는가 — 통과 중이라는 뜻이다.
 * 급행이 통과역을 지날 때 API가 잠깐 전역도착(ARRIVED)을 주는데, 그걸 "정차"로 그리면
 * 급행이 역마다 멈추는 것처럼 보인다. 역이 급행 정차역인지(isExpressStop)로 갈라낸다.
 */
export function isPassing(train: Train): boolean {
  return (
    train.trainType === 'EXPRESS' &&
    train.status === 'ARRIVED' &&
    !train.currentStation.isExpressStop
  );
}

/** 상태 딱지 — 정차·통과·진입·출발·이동을 글자로도 알린다. */
export function stateLabel(train: Train): string {
  if (train.status === 'ARRIVED') return isPassing(train) ? '통과' : '정차';
  if (train.status === 'APPROACHING') return '진입';
  if (train.status === 'DEPARTED') return '출발';
  return '이동';
}

/** 시간 자리에 보여줄 문구 — 내 역 도착·곧 도착은 시간을 대신한다. */
export function headline(train: Train, remaining: number | null, selectedName: string): string {
  const atSelected = train.currentStation.name === selectedName;
  if (train.status === 'ARRIVED' && atSelected) return '도착';
  if (train.status === 'APPROACHING' && train.stationsAway === 0) return '곧 도착';
  if (remaining !== null && remaining <= SOON_SECONDS) return '곧 도착';
  return formatRemaining(remaining);
}

/** 스크린리더가 읽을 위치 설명 — 화면에는 색과 모양으로만 나오는 정보를 말로 준다. */
export function describePosition(train: Train): string {
  const type = train.trainType === 'EXPRESS' ? '급행' : '일반';
  if (train.status === 'ARRIVED') {
    return `${type}, ${train.currentStation.name} ${isPassing(train) ? '통과' : '정차'}`;
  }
  if (train.status === 'APPROACHING') return `${type}, ${train.currentStation.name} 진입`;
  return `${type}, ${train.currentStation.name} 출발, 이동 중`;
}

/** 같은 자리에 겹친 열차들을 묶은 하나의 마크. */
export type MarkGroup = {
  key: string;
  center: number;
  moving: boolean;
  /** 이 자리에 있는 열차 종류들 — 둘이면 두 색으로 그린다. */
  types: TrainType[];
  state: string;
  label: string;
};

/**
 * 겹친 열차를 하나의 마크로 묶는다.
 * 정차(점)와 이동(화살표)은 애초에 다른 그림이라 섞지 않는다.
 */
export function groupMarks(placed: PlacedTrain[]): MarkGroup[] {
  const sorted = placed
    .map((p) => ({ p, center: centerOf(p.pos), moving: p.pos.kind === 'segment' }))
    .sort((a, b) => a.center - b.center);

  const groups: MarkGroup[] = [];
  let current: typeof sorted = [];

  const flush = () => {
    if (current.length === 0) return;
    const centers = current.map((c) => c.center);
    // 딱지는 급행 우선 — 일반이 서 있고 급행이 그 위를 지나가면 "정차"가 아니라 "통과"를 보인다.
    const lead = current.find((c) => c.p.train.trainType === 'EXPRESS') ?? current[0];
    groups.push({
      key: current.map((c) => c.p.train.trainId).join('+'),
      center: centers.reduce((a, b) => a + b, 0) / centers.length,
      moving: current[0].moving,
      types: [...new Set(current.map((c) => c.p.train.trainType))],
      state: stateLabel(lead.p.train),
      label: current.map((c) => describePosition(c.p.train)).join(', '),
    });
    current = [];
  };

  for (const item of sorted) {
    const previous = current[current.length - 1];
    const joins =
      previous && previous.moving === item.moving && item.center - previous.center < MARK_HALF * 2;
    if (!joins) flush();
    current.push(item);
  }
  flush();

  return groups;
}

/**
 * 방면 이름 밑 고정 칸에 넣을 도착 안내 — 곧 올 열차 최대 두 대.
 * 트랙 밖에서 다가오는 열차도 자리가 남으면 여기 올라온다.
 */
export type ArrivalSlot = { train: Train; text: string } | null;

export function arrivalSlots(
  placed: PlacedTrain[],
  nextOffTrack: { train: Train; remaining: number | null } | null,
  selectedName: string,
  count = 2,
): ArrivalSlot[] {
  const candidates = [
    ...placed.map((p) => ({ train: p.train, remaining: p.remaining })),
    ...(nextOffTrack ? [nextOffTrack] : []),
  ].sort(
    (a, b) => (a.remaining ?? Number.POSITIVE_INFINITY) - (b.remaining ?? Number.POSITIVE_INFINITY),
  );

  return Array.from({ length: count }, (_, i) => {
    const c = candidates[i];
    return c ? { train: c.train, text: headline(c.train, c.remaining, selectedName) } : null;
  });
}

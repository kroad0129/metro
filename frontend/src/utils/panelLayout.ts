import type { DirectionBlock, Station, Train } from '../types/subway';
import { segmentPercents, trainPlacement } from './placement';
import { buildTrack } from './trackPosition';
import { leftPercentFromGaps, liveRemainingSeconds } from './virtualTrain';

/**
 * 한 방향 패널의 배치 계산 — 트랙에 그릴 역들과, 각 열차의 트랙 좌표·남은 시간·지연 여부.
 * 화면 표현(점이냐 화살표냐, 겹칠 때 어떻게 하느냐)은 이 값을 받는 쪽이 정한다.
 */

export type TrackPos =
  | { kind: 'station'; left: number }
  | { kind: 'segment'; left: number; width: number };

export type PlacedTrain = {
  train: Train;
  remaining: number | null;
  pos: TrackPos;
};

export type DirectionLayout = {
  track: Station[];
  maxGaps: number;
  placed: PlacedTrain[];
  /** 트랙 밖에서 다가오는 가장 가까운 열차 — "다음 열차 N분"으로 안내한다. */
  nextOffTrack: { train: Train; remaining: number | null } | null;
};

export function layoutDirection(
  stations: Station[],
  selected: Station,
  block: DirectionBlock,
  nowMs: number,
): DirectionLayout {
  const track = buildTrack(stations, selected, block.directionId);
  const maxGaps = track.length - 1;

  const all = block.trains.map((train) => {
    const placement = trainPlacement(train);
    let pos: TrackPos | null = null;
    if (placement?.kind === 'station') {
      const left = leftPercentFromGaps(maxGaps, placement.gap);
      if (left !== null) pos = { kind: 'station', left };
    } else if (placement?.kind === 'segment') {
      const seg = segmentPercents(maxGaps, placement.fromGap, placement.toGap, placement.phase);
      if (seg) pos = { kind: 'segment', ...seg };
    }
    return {
      train,
      pos,
      // 내 역을 지나간 열차는 그리지도, "다음 열차"로 세지도 않는다.
      passed: placement === null && train.stationsAway === 0,
      remaining: liveRemainingSeconds(train, nowMs),
    };
  });

  const off = all.find((p) => p.pos === null && !p.passed);
  return {
    track,
    maxGaps,
    placed: all.filter((p): p is typeof p & { pos: TrackPos } => p.pos !== null),
    nextOffTrack: off ? { train: off.train, remaining: off.remaining } : null,
  };
}

/** 선택역에서 gap개 떨어진 트랙 위의 역 (트랙 밖이면 null). */
export function stationAtGap(track: Station[], gap: number): Station | null {
  return track[track.length - 1 - gap] ?? null;
}

/** 트랙 좌표의 중앙(%) — 겹침 판정과 마크 배치에 쓴다. */
export function centerOf(pos: TrackPos): number {
  return pos.kind === 'station' ? pos.left : pos.left + pos.width / 2;
}

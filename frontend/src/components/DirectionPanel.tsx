import type { DirectionBlock, Station, Train } from '../types/subway';
import { buildTrack, formatRemaining } from '../utils/trackPosition';
import { leftPercentFromGaps, liveRemainingSeconds, virtualGaps } from '../utils/virtualTrain';
import { LineTrack } from './LineTrack';
import './DirectionPanel.css';

type Props = {
  stations: Station[];
  selected: Station;
  block: DirectionBlock;
  /** 화면 전용 초 단위 틱(useNow) — 가상 열차를 매초 전진시킨다. 조회를 유발하지 않는다. */
  nowMs: number;
};

export function DirectionPanel({ stations, selected, block, nowMs }: Props) {
  const track = buildTrack(stations, selected, block.directionId);
  const maxGaps = track.length - 1;

  const positioned = block.trains.map((train) => {
    const gaps = virtualGaps(train, nowMs);
    return {
      train,
      gaps,
      remaining: liveRemainingSeconds(train, nowMs),
      left: gaps === null ? null : leftPercentFromGaps(maxGaps, gaps),
    };
  });

  const onTrack = positioned.filter((p) => p.left !== null) as {
    train: Train;
    remaining: number | null;
    left: number;
  }[];
  // 트랙보다 먼 열차(지나간 열차는 제외) 중 가장 가까운 것 — "다음 열차"로 안내한다.
  const nextOffTrack = positioned.find((p) => p.left === null && (p.gaps ?? 1) > 0);

  return (
    <section className="direction-panel">
      <h2 className="direction-panel__title">{block.directionName}</h2>

      <LineTrack track={track} trains={onTrack} selected={selected} />

      {block.trains.length === 0 && <p className="direction-panel__empty">접근 중인 열차 없음</p>}

      {nextOffTrack && (
        <p className="direction-panel__next">다음 열차 {formatRemaining(nextOffTrack.remaining)}</p>
      )}
    </section>
  );
}

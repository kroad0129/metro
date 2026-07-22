import type { DirectionBlock, Station } from '../types/subway';
import { buildTrack, formatRemaining, trainLeftPercent } from '../utils/trackPosition';
import { LineTrack } from './LineTrack';
import './DirectionPanel.css';

type Props = {
  stations: Station[];
  selected: Station;
  block: DirectionBlock;
  /** 화면 전용 틱(useNow) — LineTrack/TrainMarker로 그대로 흘려보낸다. */
  nowMs: number;
  /** 이 block의 열차 데이터가 조회된 시각. */
  updatedAt: string;
};

export function DirectionPanel({ stations, selected, block, nowMs, updatedAt }: Props) {
  const track = buildTrack(stations, selected, block.directionId);

  const onTrack = block.trains.filter((train) => trainLeftPercent(track, train) !== null);
  const offTrack = block.trains.filter((train) => trainLeftPercent(track, train) === null);
  const nextOffTrack = offTrack[0];

  return (
    <section className="direction-panel">
      <h2 className="direction-panel__title">{block.directionName}</h2>

      <LineTrack track={track} trains={onTrack} selected={selected} nowMs={nowMs} updatedAt={updatedAt} />

      {block.trains.length === 0 && (
        <p className="direction-panel__empty">접근 중인 열차 없음</p>
      )}

      {nextOffTrack && (
        <p className="direction-panel__next">
          다음 열차 {formatRemaining(nextOffTrack.remainingSeconds)}
        </p>
      )}
    </section>
  );
}

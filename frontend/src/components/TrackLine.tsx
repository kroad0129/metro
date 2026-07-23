import type { Station } from '../types/subway';
import { namePercent, type MarkGroup } from '../utils/trackMarks';
import { TrainMark } from './TrainMark';

type Props = {
  track: Station[];
  selected: Station;
  groups: MarkGroup[];
  /** true면 선택역이 왼쪽 끝, 열차는 오른쪽에서 왼쪽으로 흐른다. */
  flip: boolean;
};

/**
 * 노선 라인 — 선은 끊기지 않고, 열차 마크가 그 위에 정확히 얹힌다.
 * 상태 딱지(정차·진입·출발·이동)는 마크 위, 역 이름은 선 아래에 둬서 서로 층이 겹치지 않는다.
 */
export function TrackLine({ track, selected, groups, flip }: Props) {
  return (
    <>
      <div className="track">
        <div className="track__rail" aria-hidden="true" />

        {groups.map((group) => (
          <span
            key={group.key}
            className="track__mark"
            data-testid="track-mark"
            data-types={group.types.join(',')}
            style={{ left: `${flip ? 100 - group.center : group.center}%` }}
            aria-label={group.label}
          >
            <span className="track__above" aria-hidden="true">
              {group.state}
            </span>
            <TrainMark moving={group.moving} flip={flip} types={group.types} />
          </span>
        ))}
      </div>

      <div className="track__names">
        {track.map((station, index) => (
          <span
            key={station.stationId}
            className={
              station.stationId === selected.stationId
                ? 'track__name track__name--sel'
                : 'track__name'
            }
            style={{ left: `${namePercent(index, track.length, flip)}%` }}
            data-testid="track-station"
          >
            {station.name}
          </span>
        ))}
      </div>
    </>
  );
}

import type { Station, Train } from '../types/subway';
import { TrainMarker } from './TrainMarker';

type Props = {
  track: Station[];
  /** 가상 위치·남은 시간이 계산된 트랙 안의 열차들. */
  trains: { train: Train; remaining: number | null; left: number }[];
  selected: Station;
};

export function LineTrack({ track, trains, selected }: Props) {
  return (
    <div className="line-track">
      <div className="line-track__rail" aria-hidden="true" />

      <div className="line-track__stations">
        {track.map((station, index) => {
          // 역 이름표를 점과 같은 % 좌표에 둔다 — 정차한 점이 이름표 바로 아래 오도록.
          const left = track.length === 1 ? 100 : (index / (track.length - 1)) * 100;
          return (
            <span
              key={station.stationId}
              className={
                station.stationId === selected.stationId
                  ? 'line-track__station line-track__station--selected'
                  : 'line-track__station'
              }
              style={{ left: `${left}%` }}
              data-testid="track-station"
            >
              {station.name}
            </span>
          );
        })}
      </div>

      <div className="line-track__trains">
        {trains.map(({ train, remaining, left }) => (
          <TrainMarker
            key={train.trainId}
            train={train}
            leftPercent={left}
            remainingSeconds={remaining}
            showExpressBadge={train.trainType === 'EXPRESS'}
            selectedStationName={selected.name}
          />
        ))}
      </div>
    </div>
  );
}

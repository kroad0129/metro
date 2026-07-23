import type { Station, Train } from '../types/subway';
import { TrainFlow } from './TrainFlow';
import { TrainMarker } from './TrainMarker';

/** 트랙 좌표가 계산된 열차 — 역 위의 점이거나, 두 역 사이의 이동 구간이다. */
export type OnTrackTrain = {
  train: Train;
  remaining: number | null;
  delayed: boolean;
  pos: { kind: 'station'; left: number } | { kind: 'segment'; left: number; width: number };
};

type Props = {
  track: Station[];
  trains: OnTrackTrain[];
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
        {trains.map(({ train, remaining, delayed, pos }) =>
          pos.kind === 'station' ? (
            <TrainMarker
              key={train.trainId}
              train={train}
              leftPercent={pos.left}
              remainingSeconds={remaining}
              delayed={delayed}
              showExpressBadge={train.trainType === 'EXPRESS'}
              selectedStationName={selected.name}
            />
          ) : (
            <TrainFlow
              key={train.trainId}
              train={train}
              leftPercent={pos.left}
              widthPercent={pos.width}
              remainingSeconds={remaining}
              delayed={delayed}
              showExpressBadge={train.trainType === 'EXPRESS'}
              selectedStationName={selected.name}
            />
          ),
        )}
      </div>
    </div>
  );
}

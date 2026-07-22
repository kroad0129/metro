import type { Station, Train } from '../types/subway';
import { trainLeftPercent } from '../utils/trackPosition';
import { TrainMarker } from './TrainMarker';

type Props = {
  track: Station[];
  trains: Train[];
  selected: Station;
};

export function LineTrack({ track, trains, selected }: Props) {
  return (
    <div className="line-track">
      <div className="line-track__rail" aria-hidden="true" />

      <div className="line-track__stations">
        {track.map((station) => (
          <span
            key={station.stationId}
            className={
              station.stationId === selected.stationId
                ? 'line-track__station line-track__station--selected'
                : 'line-track__station'
            }
            data-testid="track-station"
          >
            {station.name}
          </span>
        ))}
      </div>

      <div className="line-track__trains">
        {trains.map((train) => {
          const left = trainLeftPercent(track, train);
          if (left === null) return null;
          return (
            <TrainMarker
              key={train.trainId}
              train={train}
              leftPercent={left}
              showExpressBadge={train.trainType === 'EXPRESS'}
            />
          );
        })}
      </div>
    </div>
  );
}

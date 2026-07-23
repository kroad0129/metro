import type { Station, Train } from '../types/subway';
import { TrainFlow } from './TrainFlow';
import { TrainMarker } from './TrainMarker';

/** 트랙 좌표가 계산된 열차 — 역 위의 점이거나, 두 역 사이의 이동 구간이다. */
export type OnTrackTrain = {
  train: Train;
  remaining: number | null;
  delayed: boolean;
  pos: { kind: 'station'; left: number } | { kind: 'segment'; left: number; width: number };
  /** 시각적 자리가 겹칠 때의 줄 번호(0 = 첫 줄) — 겹친 열차는 아랫줄에 그린다. */
  lane: number;
};

type Props = {
  track: Station[];
  trains: OnTrackTrain[];
  selected: Station;
};

export function LineTrack({ track, trains, selected }: Props) {
  // 아랫줄이 필요한 만큼 트랙을 세로로 늘린다 — 겹친 열차가 패널 밖으로 밀리지 않게.
  const maxLane = trains.reduce((max, t) => Math.max(max, t.lane), 0);
  return (
    <div className="line-track" style={{ height: `calc(4rem + ${maxLane} * 2.8rem)` }}>
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
        {trains.map(({ train, remaining, delayed, pos, lane }) =>
          pos.kind === 'station' ? (
            <TrainMarker
              key={train.trainId}
              train={train}
              leftPercent={pos.left}
              remainingSeconds={remaining}
              delayed={delayed}
              lane={lane}
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
              lane={lane}
              showExpressBadge={train.trainType === 'EXPRESS'}
              selectedStationName={selected.name}
            />
          ),
        )}
      </div>
    </div>
  );
}

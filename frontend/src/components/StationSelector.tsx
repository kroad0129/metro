import type { Station } from '../types/subway';

type Props = {
  stations: Station[];
  selected: Station | null;
  onSelect: (stationId: string) => void;
};

export function StationSelector({ stations, selected, onSelect }: Props) {
  return (
    <div className="station-selector">
      <label htmlFor="station-select">역</label>
      <select
        id="station-select"
        value={selected?.stationId ?? ''}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="" disabled>
          역 선택
        </option>
        {stations.map((station) => (
          <option key={station.stationId} value={station.stationId}>
            {station.name}
          </option>
        ))}
      </select>
    </div>
  );
}

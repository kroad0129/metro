import { DirectionPanel } from './components/DirectionPanel';
import { RefreshBar } from './components/RefreshBar';
import { StationSelector } from './components/StationSelector';
import { ErrorView, LoadingView, StaleBanner } from './components/states/StatusViews';
import { useSelectedStation } from './hooks/useSelectedStation';
import { useStations } from './hooks/useStations';
import { useTrainData } from './hooks/useTrainData';
import './App.css';

export default function App() {
  const { stations, loading: stationsLoading, error: stationsError } = useStations();
  const { selected, select } = useSelectedStation(stations);
  const { data, loading, error, refresh, canRefresh } = useTrainData(selected?.stationId ?? null);

  if (stationsLoading) {
    return (
      <main className="app">
        <LoadingView />
      </main>
    );
  }

  if (stationsError) {
    return (
      <main className="app">
        <ErrorView error={stationsError} />
      </main>
    );
  }

  return (
    <main className="app">
      <StationSelector stations={stations} selected={selected} onSelect={select} />

      {!selected && <p className="status">역을 선택하세요</p>}

      {selected && data?.stale && <StaleBanner updatedAt={data.updatedAt} />}

      {selected && error && <ErrorView error={error} onRetry={refresh} />}

      {selected && !error && !data && loading && <LoadingView />}

      {selected && !error && data && (
        <div className="app__directions">
          {data.directions.map((block) => (
            <DirectionPanel
              key={block.directionId}
              stations={stations}
              selected={selected}
              block={block}
            />
          ))}
        </div>
      )}

      {selected && (
        <RefreshBar
          updatedAt={data?.updatedAt ?? null}
          loading={loading}
          canRefresh={canRefresh}
          onRefresh={refresh}
        />
      )}
    </main>
  );
}

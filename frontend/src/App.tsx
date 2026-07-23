import { useEffect, useState } from 'react';
import { DirectionPanel } from './components/DirectionPanel';
import { RefreshBar } from './components/RefreshBar';
import { StationSelector } from './components/StationSelector';
import { ErrorView, LoadingView, StaleBanner } from './components/states/StatusViews';
import { useNow } from './hooks/useNow';
import { useSelectedStation } from './hooks/useSelectedStation';
import { useStations } from './hooks/useStations';
import { POLL_INTERVAL_MS, useTrainData } from './hooks/useTrainData';
import './App.css';

const AUTO_REFRESH_KEY = 'metro:autoRefresh';

export default function App() {
  const { stations, loading: stationsLoading, error: stationsError } = useStations();
  const { selected, select } = useSelectedStation(stations);

  // 자동 갱신(폴링) 여부. 기본은 꺼짐 — 개발키 호출 한도를 아끼고, 켜서 폴링을 시험한다.
  const [autoRefresh, setAutoRefresh] = useState(() => {
    try {
      return localStorage.getItem(AUTO_REFRESH_KEY) === 'on';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_REFRESH_KEY, autoRefresh ? 'on' : 'off');
    } catch {
      /* localStorage 불가 환경은 무시 */
    }
  }, [autoRefresh]);

  const { data, loading, error, refresh, canRefresh } = useTrainData(
    selected?.stationId ?? null,
    autoRefresh ? POLL_INTERVAL_MS : null,
  );
  // 화면 전용 초 단위 틱 — 가상 열차 전진과 "N초 전 갱신" 문구용. 데이터는 다시 조회하지 않는다.
  const nowMs = useNow();

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

      {/* 데이터가 아예 없을 때만 오류 화면. 있으면 화면을 유지하고 배너로만 알린다 —
          일시적 폴링 실패로 화면이 통째로 사라졌다 돌아오지 않게. */}
      {selected && error && !data && <ErrorView error={error} onRetry={refresh} />}

      {selected && error && data && (
        <p className="status status--warn">갱신에 실패했어요 — 마지막 정보를 표시하고 있어요</p>
      )}

      {selected && !error && !data && loading && <LoadingView />}

      {selected && data && (
        <div className="app__directions">
          {data.directions.map((block) => (
            <DirectionPanel
              key={block.directionId}
              stations={stations}
              selected={selected}
              block={block}
              nowMs={nowMs}
              /* 아래 방향 패널은 진행 방향을 반전해 두 패널이 서로 마주 보게 한다. */
              flip={block.directionId === 'DOWN'}
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
          nowMs={nowMs}
          autoRefresh={autoRefresh}
          onToggleAuto={setAutoRefresh}
        />
      )}
    </main>
  );
}
